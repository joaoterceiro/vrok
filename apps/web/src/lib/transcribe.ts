import { db, appSettings } from '@zora/db';
import { decryptString } from '@zora/shared/crypto';
import { inArray } from 'drizzle-orm';
import { minio, MINIO_BUCKET } from './minio';
import { LLM_SETTING_KEYS } from './llm-config';

/**
 * Speech-to-text via Whisper. Tries Groq first (whisper-large-v3 — fast and
 * cheap), falls back to OpenAI. Reads the API key from `app_settings` with
 * env-var fallback, the same precedence rule as the rest of the LLM stack.
 */

const PROVIDER_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
  openai: 'https://api.openai.com/v1/audio/transcriptions',
} as const;

const PROVIDER_MODEL = {
  groq: 'whisper-large-v3',
  openai: 'whisper-1',
} as const;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Whisper hard limit on both providers.

export interface TranscriptResult {
  text: string;
  provider: 'groq' | 'openai';
  generatedAt: string;
  durationMs?: number;
}

/**
 * Download an audio object from MinIO and transcribe it. Throws when no
 * provider key is configured or both providers fail.
 */
export async function transcribeAudio(
  minioKey: string,
  mime?: string | null,
): Promise<TranscriptResult> {
  const buf = await readObjectBuffer(minioKey);
  if (buf.length > MAX_AUDIO_BYTES) {
    throw new Error(`Áudio acima de 25MB (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
  }

  const keys = await loadKeys();
  const providers: Array<'groq' | 'openai'> = [];
  if (keys.groq) providers.push('groq');
  if (keys.openai) providers.push('openai');
  if (providers.length === 0) {
    throw new Error(
      'Sem API key configurada para transcrição. Configure Groq ou OpenAI em ⚙ → LLM / IA.',
    );
  }

  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      const started = Date.now();
      const text = await callWhisper(provider, keys[provider]!, buf, minioKey, mime);
      return {
        text,
        provider,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - started,
      };
    } catch (err) {
      lastError = err as Error;
      // Try the next provider before giving up.
    }
  }
  throw lastError ?? new Error('Transcrição falhou em todos os provedores');
}

async function callWhisper(
  provider: 'groq' | 'openai',
  apiKey: string,
  buf: Buffer,
  minioKey: string,
  mime?: string | null,
): Promise<string> {
  const fileName = friendlyFileName(minioKey, mime);
  const blob = new Blob([new Uint8Array(buf)], { type: mime || 'audio/ogg' });
  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model', PROVIDER_MODEL[provider]);
  form.append('response_format', 'json');
  // Whisper is multilingual but giving it a hint cuts wrong-language artifacts.
  form.append('language', 'pt');

  const res = await fetch(PROVIDER_ENDPOINTS[provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Whisper ${provider} HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text?: string };
  if (!json.text || typeof json.text !== 'string') {
    throw new Error(`Whisper ${provider}: resposta sem campo "text"`);
  }
  return json.text.trim();
}

async function readObjectBuffer(key: string): Promise<Buffer> {
  const stream = await minio.getObject(MINIO_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function loadKeys(): Promise<{ groq: string | null; openai: string | null }> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, isSecret: appSettings.isSecret })
    .from(appSettings)
    .where(inArray(appSettings.key, [LLM_SETTING_KEYS.groqKey, LLM_SETTING_KEYS.openaiKey]));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return {
    groq: readSecret(byKey.get(LLM_SETTING_KEYS.groqKey)) ?? process.env.GROQ_API_KEY ?? null,
    openai: readSecret(byKey.get(LLM_SETTING_KEYS.openaiKey)) ?? process.env.OPENAI_API_KEY ?? null,
  };
}

function readSecret(
  row: { value: string | null; isSecret: boolean } | undefined,
): string | null {
  if (!row?.value) return null;
  try {
    return row.isSecret ? decryptString(row.value) : row.value;
  } catch {
    return null;
  }
}

function friendlyFileName(key: string, mime?: string | null): string {
  const tail = key.split('/').pop() ?? 'audio';
  if (tail.includes('.')) return tail;
  const ext =
    mime?.includes('ogg')
      ? 'ogg'
      : mime?.includes('mp4')
        ? 'mp4'
        : mime?.includes('mpeg') || mime?.includes('mp3')
          ? 'mp3'
          : mime?.includes('wav')
            ? 'wav'
            : 'ogg';
  return `${tail}.${ext}`;
}
