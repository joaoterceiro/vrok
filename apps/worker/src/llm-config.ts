import { appSettings } from '@zora/db';
import { decryptString } from '@zora/shared/crypto';
import { getLLM, type LLMFactoryOptions, type LLMProvider } from '@zora/shared/llm';
import { inArray } from 'drizzle-orm';
import { db } from './db';

const LLM_KEYS = {
  provider: 'llm.provider',
  model: 'llm.model',
  anthropicKey: 'llm.key.anthropic',
  openaiKey: 'llm.key.openai',
  groqKey: 'llm.key.groq',
} as const;

type LlmProviderName = 'anthropic' | 'openai' | 'groq';
interface Resolved { provider: LlmProviderName; model?: string; apiKey: string }

let cache: { value: Resolved | null; loadedAt: number } = { value: null, loadedAt: 0 };
const TTL_MS = 30_000;

/**
 * Worker-side LLM resolver — same precedence as the web app
 * (DB settings > env). Lets the operator update LLM keys from the UI
 * without restarting the worker.
 */
export async function getConfiguredLlm(): Promise<LLMProvider> {
  if (cache.value && Date.now() - cache.loadedAt < TTL_MS) {
    return instantiate(cache.value);
  }

  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, isSecret: appSettings.isSecret })
    .from(appSettings)
    .where(inArray(appSettings.key, Object.values(LLM_KEYS)));
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const providerSetting = byKey.get(LLM_KEYS.provider)?.value ?? null;
  const provider: LlmProviderName =
    providerSetting === 'openai' || providerSetting === 'groq' || providerSetting === 'anthropic'
      ? providerSetting
      : (process.env.LLM_PROVIDER as LlmProviderName) || 'anthropic';

  const model = byKey.get(LLM_KEYS.model)?.value || process.env.LLM_MODEL;
  const apiKey = pickKey(byKey, provider);

  const value: Resolved = { provider, model: model || undefined, apiKey };
  cache = { value, loadedAt: Date.now() };
  return instantiate(value);
}

function pickKey(
  byKey: Map<string, { value: string | null; isSecret: boolean }>,
  provider: LlmProviderName,
): string {
  const keyName =
    provider === 'anthropic'
      ? LLM_KEYS.anthropicKey
      : provider === 'openai'
        ? LLM_KEYS.openaiKey
        : LLM_KEYS.groqKey;
  const row = byKey.get(keyName);
  if (row?.value) {
    try {
      return row.isSecret ? decryptString(row.value) : row.value;
    } catch {
      /* fall through to env */
    }
  }
  return (
    (provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : provider === 'openai'
        ? process.env.OPENAI_API_KEY
        : process.env.GROQ_API_KEY) ?? ''
  );
}

function instantiate(cfg: Resolved): LLMProvider {
  if (!cfg.apiKey) {
    throw new Error(
      `Sem API key configurada para ${cfg.provider}. Configure em ⚙ → LLM / IA.`,
    );
  }
  const opts: LLMFactoryOptions = {
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    model: cfg.model,
  };
  return getLLM(opts);
}
