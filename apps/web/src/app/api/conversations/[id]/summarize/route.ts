import { NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import {
  db,
  conversations,
  contacts,
  messages as messagesTable,
  attachments as attachmentsTable,
} from '@zora/db';
import { type LLMMessage } from '@zora/shared/llm';
import { requireSession } from '@/lib/api/guards';
import { getConfiguredLlm } from '@/lib/llm-config';
import { transcribeAudio, type TranscriptResult } from '@/lib/transcribe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGES_FOR_CONTEXT = 40;

interface AiSummary {
  /** 2–3 sentence overview. */
  tldr: string;
  /** Current state of the conversation in 1 sentence. */
  status: string;
  /** Outstanding questions the customer asked that aren't answered. */
  openQuestions: string[];
  /** Concrete next step for the operator. */
  nextStep: string;
  /** Detected sentiment. */
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'urgent';
}

interface CachedSummary {
  summary: AiSummary;
  generatedAt: string;
  /** Number of messages the summary was based on — staleness signal. */
  messageCount: number;
  /** Which model generated it (for traceability). */
  provider: string;
}

/**
 * GET /api/conversations/:id/summarize
 * Returns the cached AI summary if one exists. No LLM call.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const cached = readCached(conv.metadata as Record<string, unknown>);
  const messageCount = await countMessages(id);

  return NextResponse.json({
    cached,
    messageCount,
    stale: cached ? messageCount !== cached.messageCount : false,
  });
}

/**
 * POST /api/conversations/:id/summarize?force=1
 * Generates (or refreshes) the AI summary by sending the recent transcript
 * to the configured LLM. Stores the result in conversation.metadata.aiSummary.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const force = new URL(req.url).searchParams.get('force') === '1';

  const [conv] = await db
    .select({
      id: conversations.id,
      metadata: conversations.metadata,
      contactName: contacts.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const messageCount = await countMessages(id);
  if (messageCount === 0) {
    return NextResponse.json(
      { error: 'no_messages', detail: 'Conversa sem mensagens para resumir' },
      { status: 400 },
    );
  }

  // Reuse cached result when content hasn't changed (cheap UX win — saves
  // a token round-trip if the operator reopens the panel).
  const cached = readCached(conv.metadata as Record<string, unknown>);
  if (!force && cached && cached.messageCount === messageCount) {
    return NextResponse.json({ summary: cached.summary, generatedAt: cached.generatedAt, cached: true });
  }

  // Build transcript (oldest-first). For audio messages we transcribe via
  // Whisper so the LLM gets the actual content instead of "[áudio]".
  const transcript = await db
    .select({
      id: messagesTable.id,
      direction: messagesTable.direction,
      sender: messagesTable.sender,
      body: messagesTable.body,
      contentType: messagesTable.contentType,
      metadata: messagesTable.metadata,
      createdAt: messagesTable.createdAt,
    })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(asc(messagesTable.createdAt))
    .limit(MAX_MESSAGES_FOR_CONTEXT);

  // Ensure each audio message has a transcript. Reuse cached transcripts
  // from message.metadata; transcribe missing ones in parallel (capped).
  const audioMessageIds = transcript
    .filter(
      (m) =>
        m.contentType === 'audio' &&
        !(m.metadata as Record<string, unknown>)?.transcript,
    )
    .map((m) => m.id);

  const transcriptsById = new Map<string, string>();

  if (audioMessageIds.length > 0) {
    const audioAttachments = await db
      .select({
        messageId: attachmentsTable.messageId,
        minioKey: attachmentsTable.minioKey,
        mime: attachmentsTable.mime,
      })
      .from(attachmentsTable)
      .where(sql`${attachmentsTable.messageId} = ANY(${audioMessageIds}::uuid[])`);

    const settled = await Promise.allSettled(
      audioAttachments.slice(0, 8).map(async (a) => {
        const result = await transcribeAudio(a.minioKey, a.mime);
        await db
          .update(messagesTable)
          .set({
            metadata: sql`COALESCE(${messagesTable.metadata}, '{}'::jsonb) || ${JSON.stringify({ transcript: result })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(messagesTable.id, a.messageId));
        return { messageId: a.messageId, result };
      }),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        transcriptsById.set(r.value.messageId, r.value.result.text);
      }
    }
  }

  const lines = transcript
    .map((m) => {
      const who =
        m.direction === 'in'
          ? `Cliente (${conv.contactName ?? 'desconhecido'})`
          : m.sender === 'bot'
            ? 'Bot'
            : 'Atendente';
      const cachedTranscript =
        ((m.metadata as Record<string, unknown>)?.transcript as TranscriptResult | undefined)?.text;
      const freshTranscript = transcriptsById.get(m.id);
      const audioText = cachedTranscript || freshTranscript;
      const body =
        m.body?.trim() ||
        (audioText ? `[áudio transcrito] ${audioText}` : null) ||
        labelForType(m.contentType as string) ||
        '[mensagem não textual]';
      return `${who}: ${body}`;
    })
    .join('\n');

  let llm;
  try {
    llm = await getConfiguredLlm();
  } catch (err) {
    return NextResponse.json(
      { error: 'llm_unavailable', detail: (err as Error).message },
      { status: 503 },
    );
  }

  const systemPrompt = [
    'Você é um assistente que resume conversas de atendimento ao cliente para que um operador entenda o contexto em segundos.',
    'Responda APENAS com um objeto JSON válido — sem markdown, sem texto adicional, sem ```json``` — seguindo exatamente este schema:',
    '{',
    '  "tldr": "string de 2 a 3 frases curtas em português do Brasil",',
    '  "status": "1 frase descrevendo o estado atual",',
    '  "openQuestions": ["pergunta 1", "pergunta 2"],',
    '  "nextStep": "ação concreta que o atendente deve tomar agora",',
    '  "sentiment": "positive | neutral | frustrated | urgent"',
    '}',
    'Se não houver perguntas em aberto, retorne array vazio. Seja conciso.',
  ].join('\n');

  const llmMessages: LLMMessage[] = [{ role: 'user', content: `Transcrição:\n${lines}` }];

  let response;
  try {
    response = await llm.generate({
      system: systemPrompt,
      messages: llmMessages,
      maxTokens: 600,
      temperature: 0.2,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'llm_failed', detail: (err as Error).message },
      { status: 502 },
    );
  }

  const parsed = parseSummary(response.text);
  if (!parsed) {
    return NextResponse.json(
      { error: 'llm_invalid_response', raw: response.text.slice(0, 500) },
      { status: 502 },
    );
  }

  const generatedAt = new Date().toISOString();
  const payload: CachedSummary = {
    summary: parsed,
    generatedAt,
    messageCount,
    provider: llm.name,
  };

  await db
    .update(conversations)
    .set({
      metadata: sql`COALESCE(${conversations.metadata}, '{}'::jsonb) || ${JSON.stringify({ aiSummary: payload })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, id));

  return NextResponse.json({ summary: parsed, generatedAt, cached: false, provider: llm.name });
}

// ---------- helpers --------------------------------------------------------

function readCached(metadata: Record<string, unknown> | null): CachedSummary | null {
  const raw = metadata?.aiSummary as CachedSummary | undefined;
  if (!raw?.summary?.tldr) return null;
  return raw;
}

async function countMessages(conversationId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId));
  return Number(count) || 0;
}

function labelForType(type: string): string | null {
  switch (type) {
    case 'image':
      return '[imagem]';
    case 'audio':
      return '[áudio]';
    case 'video':
      return '[vídeo]';
    case 'document':
      return '[documento]';
    case 'sticker':
      return '[sticker]';
    case 'location':
      return '[localização]';
    default:
      return null;
  }
}

function parseSummary(raw: string): AiSummary | null {
  // The model sometimes wraps the JSON in ```json fences despite instructions.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try {
    const obj = JSON.parse(cleaned) as Partial<AiSummary>;
    if (typeof obj.tldr !== 'string' || typeof obj.nextStep !== 'string') return null;
    return {
      tldr: obj.tldr,
      status: typeof obj.status === 'string' ? obj.status : '',
      openQuestions: Array.isArray(obj.openQuestions)
        ? obj.openQuestions.filter((q): q is string => typeof q === 'string')
        : [],
      nextStep: obj.nextStep,
      sentiment:
        obj.sentiment === 'positive' ||
        obj.sentiment === 'frustrated' ||
        obj.sentiment === 'urgent'
          ? obj.sentiment
          : 'neutral',
    };
  } catch {
    return null;
  }
}
