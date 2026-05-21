import { db, appSettings } from '@zora/db';
import { decryptString } from '@zora/shared/crypto';
import { getLLM, type LLMFactoryOptions, type LLMProvider } from '@zora/shared/llm';
import { eq, inArray } from 'drizzle-orm';

/**
 * Settings keys — single source of truth so the API, UI and helper agree.
 */
export const LLM_SETTING_KEYS = {
  provider: 'llm.provider',
  model: 'llm.model',
  anthropicKey: 'llm.key.anthropic',
  openaiKey: 'llm.key.openai',
  groqKey: 'llm.key.groq',
} as const;

export type LlmProviderName = 'anthropic' | 'openai' | 'groq';

interface ResolvedConfig {
  provider: LlmProviderName;
  model?: string;
  apiKey: string;
}

interface CacheEntry {
  value: ResolvedConfig | null;
  loadedAt: number;
}

const CACHE_TTL_MS = 30_000;
let cache: CacheEntry = { value: null, loadedAt: 0 };

/** Invalidate the in-memory cache (called by the PATCH route). */
export function invalidateLlmConfigCache() {
  cache = { value: null, loadedAt: 0 };
}

/**
 * Resolve the LLM config to use. Order of precedence:
 *   1. `app_settings` DB rows (set via the UI)
 *   2. environment variables (LLM_PROVIDER, *_API_KEY)
 * Throws if no API key can be found for the chosen provider.
 */
export async function resolveLlmConfig(): Promise<ResolvedConfig> {
  if (cache.value && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.value;
  }

  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, isSecret: appSettings.isSecret })
    .from(appSettings)
    .where(
      inArray(appSettings.key, [
        LLM_SETTING_KEYS.provider,
        LLM_SETTING_KEYS.model,
        LLM_SETTING_KEYS.anthropicKey,
        LLM_SETTING_KEYS.openaiKey,
        LLM_SETTING_KEYS.groqKey,
      ]),
    );
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const providerSetting = byKey.get(LLM_SETTING_KEYS.provider)?.value ?? null;
  const provider: LlmProviderName =
    providerSetting === 'openai' || providerSetting === 'groq' || providerSetting === 'anthropic'
      ? providerSetting
      : (process.env.LLM_PROVIDER as LlmProviderName) || 'anthropic';

  const modelFromDb = byKey.get(LLM_SETTING_KEYS.model)?.value ?? null;
  const model = modelFromDb || process.env.LLM_MODEL;

  const keyMap: Record<LlmProviderName, string> = {
    anthropic: readSecret(byKey, LLM_SETTING_KEYS.anthropicKey) ?? process.env.ANTHROPIC_API_KEY ?? '',
    openai: readSecret(byKey, LLM_SETTING_KEYS.openaiKey) ?? process.env.OPENAI_API_KEY ?? '',
    groq: readSecret(byKey, LLM_SETTING_KEYS.groqKey) ?? process.env.GROQ_API_KEY ?? '',
  };
  const apiKey = keyMap[provider];

  const resolved: ResolvedConfig = { provider, model: model || undefined, apiKey };
  cache = { value: resolved, loadedAt: Date.now() };
  return resolved;
}

/** Helper for route handlers — instantiates a configured LLMProvider. */
export async function getConfiguredLlm(): Promise<LLMProvider> {
  const cfg = await resolveLlmConfig();
  if (!cfg.apiKey) {
    throw new Error(
      `Sem API key configurada para ${cfg.provider}. Acesse Configurações → LLM / IA.`,
    );
  }
  const opts: LLMFactoryOptions = {
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    model: cfg.model,
  };
  return getLLM(opts);
}

function readSecret(
  byKey: Map<string, { value: string | null; isSecret: boolean }>,
  key: string,
): string | null {
  const row = byKey.get(key);
  if (!row?.value) return null;
  try {
    return row.isSecret ? decryptString(row.value) : row.value;
  } catch {
    return null;
  }
}
