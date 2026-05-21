import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  aiAgents,
  agentAssignments,
  conversations,
  messages,
  events,
} from '@zora/db';
import { type LLMMessage, type LLMToolSpec } from '@zora/shared/llm';
import { db } from '../db';
import { getConfiguredLlm } from '../llm-config';
import { connection } from '../connection';
import { jobLogger } from '../logger';
import { publishSocketEvent } from '../publish';
import { queues } from '../queues';
import { kbSearch } from '../kb-search';

export interface AgentJobData {
  conversationId: string;
  /** ID of the user message that triggered this turn (idempotency key). */
  triggerMessageId?: string;
}

const LOCK_TTL_SECONDS = 60;

type AgentRow = typeof aiAgents.$inferSelect;

/**
 * Phase 10 — AI agent worker. Replaces the legacy `runBot` flow.
 *
 * Agent resolution precedence:
 *   1. Conversation override (`conversations.agent_id`)
 *   2. Channel assignment (highest `priority` wins for ties)
 *   3. Org default (`ai_agents.is_default = true`)
 *
 * Skips automatically when:
 *   - A human is already assigned
 *   - The conversation is resolved
 *   - `bot_paused_at` is set
 *   - Another worker already locked this (conversationId, triggerMessageId)
 */
export async function processAgent(job: Job<AgentJobData>) {
  const { conversationId, triggerMessageId } = job.data;
  const log = jobLogger('bot', job.id, { conversationId });

  // Idempotency lock — guards against double-enqueue races + retry storms.
  const lockKey = `agent:lock:${conversationId}:${triggerMessageId ?? 'manual'}`;
  const acquired = await connection.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  if (!acquired) {
    log.debug('agent: lock held, skipping duplicate turn');
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return;

  if (conv.assigneeId) {
    log.debug('agent: skip (human assigned)');
    return;
  }
  if (conv.status === 'resolved') return;
  if (conv.botPausedAt) {
    log.debug('agent: skip (paused on conversation)');
    return;
  }

  const agent = await resolveAgent(conv.agentId, conv.channelId);
  if (!agent) {
    log.debug('agent: no agent resolved for channel');
    return;
  }

  // Build conversation context — newest 20 textual messages, oldest first.
  const recent = await db
    .select({
      direction: messages.direction,
      sender: messages.sender,
      contentType: messages.contentType,
      body: messages.body,
      isHistorical: messages.isHistorical,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const llmMessages: LLMMessage[] = recent
    .reverse()
    // Never let imported history trigger the agent — that would re-bot old chats.
    .filter((m) => !m.isHistorical && m.body && m.contentType === 'text')
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body!,
    }));
  if (llmMessages.length === 0) return;

  // Keyword-based escape hatch (configurable per agent).
  const handoffKeywords = agent.llmConfig?.handoffKeywords ?? [
    'atendente humano',
    'falar com humano',
    'humano',
    'atendente',
  ];
  const lastUserMessage = [...llmMessages].reverse().find((m) => m.role === 'user');
  if (lastUserMessage && matchesAnyKeyword(lastUserMessage.content, handoffKeywords)) {
    return handoff(conversationId, agent.id, 'Cliente solicitou atendente humano.');
  }

  // The agent record may declare a specific provider/model, but API keys
  // always come from the LLM settings (DB → env fallback). Agent overrides
  // are ignored when no DB key is configured for that provider.
  let llm;
  try {
    llm = await getConfiguredLlm();
  } catch (err) {
    log.error({ err: (err as Error).message }, 'agent: LLM unavailable');
    return;
  }

  const tools: LLMToolSpec[] = [];
  const enabledTools = agent.toolsEnabled ?? [];
  if (enabledTools.length === 0 || enabledTools.includes('handoff')) {
    tools.push({
      name: 'handoff',
      description:
        'Transfere a conversa para um atendente humano. Use quando o assunto for sensível, complexo, ou o cliente explicitamente pedir.',
      inputSchema: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Motivo curto da transferência' } },
        required: ['reason'],
      },
    });
  }

  // Knowledge-base injection — when the agent has `search_kb` enabled and
  // the last user message looks like a question/query, run an FTS search
  // and stuff the top hits into the system prompt. This is cheaper and
  // more reliable than letting the LLM call a tool for the same purpose.
  let systemPrompt = agent.systemPrompt;
  if (enabledTools.includes('search_kb') && lastUserMessage) {
    try {
      const hits = await kbSearch(lastUserMessage.content, 3);
      if (hits.length > 0) {
        const kbBlock = hits
          .map(
            (h, i) =>
              `[KB-${i + 1}] ${h.title}\n${(h.summary ?? '').trim()}\n${(h.snippet ?? '').replace(/<<\/?mark>>/g, '').replace(/<<\/?endmark>>/g, '')}`,
          )
          .join('\n\n');
        systemPrompt =
          `${agent.systemPrompt}\n\n` +
          `# Base de conhecimento (use APENAS quando relevante)\n${kbBlock}\n\n` +
          `Quando usar uma informação da base, cite entre parênteses o título do artigo. ` +
          `Se a pergunta não estiver coberta, diga que vai pedir ajuda e use \`handoff\`.`;
        log.debug({ kbHits: hits.length }, 'agent: KB context injected');
      }
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'agent: KB search failed, continuing');
    }
  }

  let response;
  try {
    response = await llm.generate({
      system: systemPrompt,
      messages: llmMessages,
      tools,
      maxTokens: agent.llmConfig?.maxTokens ?? 512,
      temperature: agent.llmConfig?.temperature ?? 0.3,
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'agent: LLM call failed');
    return;
  }

  const handoffCall = response.toolCalls.find((tc) => tc.name === 'handoff');
  if (handoffCall) {
    const reason = (handoffCall.input as { reason?: string })?.reason ?? 'Solicitado pela IA.';
    return handoff(conversationId, agent.id, reason);
  }

  const text = response.text.trim();
  if (!text) return;

  const messageId = randomUUID();
  const [created] = await db
    .insert(messages)
    .values({
      id: messageId,
      conversationId,
      direction: 'out',
      sender: 'bot',
      contentType: 'text',
      body: text,
      status: 'queued',
      metadata: { agentId: agent.id, agentName: agent.name },
    })
    .returning();

  const previewPrefix = agent.avatar ?? '🤖';
  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: `${previewPrefix} ${text.slice(0, 280)}`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  await publishSocketEvent({
    room: `conversation:${conversationId}`,
    event: 'message:new',
    data: {
      conversationId,
      messageId,
      direction: 'out',
      contentType: 'text',
      body: text,
      sender: 'bot',
      createdAt: (created?.createdAt ?? new Date()).toISOString(),
    },
  });

  await db.insert(events).values({
    type: 'agent.reply',
    conversationId,
    payload: { messageId, agentId: agent.id, provider: llm.name },
  });

  await queues.outbound.add(
    'send',
    { messageId },
    { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 1000 },
  );

  log.info({ messageId, agentId: agent.id, provider: llm.name }, 'agent replied');
}

// ----------------------------------------------------------------

async function resolveAgent(
  overrideId: string | null,
  channelId: string,
): Promise<AgentRow | null> {
  // 1. Explicit conversation override.
  if (overrideId) {
    const [a] = await db
      .select()
      .from(aiAgents)
      .where(and(eq(aiAgents.id, overrideId), eq(aiAgents.isActive, true)))
      .limit(1);
    if (a) return a;
  }

  // 2. Channel assignment (highest priority).
  const [byChannel] = await db
    .select({ agent: aiAgents })
    .from(agentAssignments)
    .innerJoin(aiAgents, eq(aiAgents.id, agentAssignments.agentId))
    .where(and(eq(agentAssignments.channelId, channelId), eq(aiAgents.isActive, true)))
    .orderBy(desc(agentAssignments.priority))
    .limit(1);
  if (byChannel) return byChannel.agent;

  // 3. Org default.
  const [byDefault] = await db
    .select()
    .from(aiAgents)
    .where(and(eq(aiAgents.isDefault, true), eq(aiAgents.isActive, true)))
    .limit(1);
  return byDefault ?? null;
}

function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const norm = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return keywords.some((kw) =>
    norm.includes(kw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()),
  );
}

async function handoff(conversationId: string, agentId: string, reason: string) {
  await db
    .update(conversations)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await db.insert(events).values({
    type: 'agent.handoff',
    conversationId,
    payload: { reason, agentId },
  });
  await publishSocketEvent({
    room: `conversation:${conversationId}`,
    event: 'conversation:updated',
    data: { conversationId, fields: { status: 'pending' } },
  });
  await publishSocketEvent({
    room: 'all',
    event: 'conversation:updated',
    data: { conversationId, fields: { status: 'pending' } },
  });
}
