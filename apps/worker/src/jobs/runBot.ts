import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { botFlows, conversations, messages, events } from '@zora/db';
import { getLLM, type LLMMessage, type LLMToolSpec } from '@zora/shared/llm';
import { db } from '../db';
import { log } from '../logger';
import { publishSocketEvent } from '../publish';
import { queues } from '../queues';

export interface BotJobData {
  conversationId: string;
  /** ID of the message that triggered the bot (the incoming user message). */
  triggerMessageId?: string;
}

/**
 * Bot worker — for each user message in a conversation that should be handled
 * by AI, generate a reply via the configured LLM. If the bot decides to hand
 * off to a human, conversation status flips to `pending` and the bot stops
 * replying.
 *
 * Handoff is signaled either via the `handoff` tool call OR by keyword match
 * in the user message (configurable per flow).
 */
export async function processBot(job: Job<BotJobData>) {
  const { conversationId } = job.data;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return;

  // Bot doesn't reply if a human is already assigned.
  if (conv.assigneeId) {
    log.debug({ conversationId }, 'bot: skip (human assigned)');
    return;
  }
  if (conv.status === 'resolved') return;

  // Pick the active flow. We support a single global active flow in Phase 4.
  const [flow] = await db
    .select()
    .from(botFlows)
    .where(eq(botFlows.isActive, true))
    .limit(1);
  if (!flow) return;

  // Build conversation context.
  const recent = await db
    .select({
      direction: messages.direction,
      sender: messages.sender,
      contentType: messages.contentType,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const llmMessages: LLMMessage[] = recent
    .reverse()
    .filter((m) => m.body && m.contentType === 'text')
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body!,
    }));
  if (llmMessages.length === 0) return;

  // Keyword-based escape hatch.
  const handoffKeywords = (flow.llmConfig as { handoffKeywords?: string[] })?.handoffKeywords ?? [
    'atendente humano',
    'falar com humano',
    'humano',
    'atendente',
  ];
  const lastUserMessage = [...llmMessages].reverse().find((m) => m.role === 'user');
  if (lastUserMessage && matchesAnyKeyword(lastUserMessage.content, handoffKeywords)) {
    return handoff(conversationId, conv.teamId, 'Cliente solicitou atendente humano.');
  }

  // Resolve LLM provider from flow config (falls back to env).
  const llmCfg = (flow.llmConfig as Record<string, unknown>) ?? {};
  const llm = getLLM({
    provider: llmCfg.provider as 'anthropic' | 'openai' | 'groq' | undefined,
    model: llmCfg.model as string | undefined,
  });

  const tools: LLMToolSpec[] = [
    {
      name: 'handoff',
      description:
        'Transfere a conversa para um atendente humano. Use quando o assunto for sensível, complexo, ou o cliente explicitamente pedir.',
      inputSchema: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Motivo curto da transferência' } },
        required: ['reason'],
      },
    },
  ];

  const systemPrompt =
    (flow.definition as { systemPrompt?: string })?.systemPrompt ??
    'Você é um assistente de atendimento amigável e objetivo. Responda em português do Brasil, em até 3 frases. Se não puder ajudar com algo, ofereça transferência para um humano usando a ferramenta `handoff`.';

  let response;
  try {
    response = await llm.generate({
      system: systemPrompt,
      messages: llmMessages,
      tools,
      maxTokens: 512,
      temperature: 0.3,
    });
  } catch (err) {
    log.error({ conversationId, err: (err as Error).message }, 'bot: LLM call failed');
    return;
  }

  // Tool call: handoff?
  const handoffCall = response.toolCalls.find((tc) => tc.name === 'handoff');
  if (handoffCall) {
    const reason = (handoffCall.input as { reason?: string })?.reason ?? 'Solicitado pela IA.';
    return handoff(conversationId, conv.teamId, reason);
  }

  const text = response.text.trim();
  if (!text) return;

  // Persist the bot reply.
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
    })
    .returning();

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: `🤖 ${text.slice(0, 280)}`,
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
    type: 'bot.reply',
    conversationId,
    payload: { messageId, provider: llm.name, flowId: flow.id },
  });

  // Enqueue outbound to actually send via the channel adapter.
  await queues.outbound.add(
    'send',
    { messageId },
    { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 1000 },
  );

  log.info({ conversationId, messageId, provider: llm.name }, 'bot replied');
}

// ----------------------------------------------------------------

function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const norm = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return keywords.some((kw) =>
    norm.includes(kw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()),
  );
}

async function handoff(conversationId: string, _teamId: string | null, reason: string) {
  await db
    .update(conversations)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await db.insert(events).values({
    type: 'bot.handoff',
    conversationId,
    payload: { reason },
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
  log.info({ conversationId, reason }, 'bot handoff');
}
