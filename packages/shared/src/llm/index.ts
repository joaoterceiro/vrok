import type { LLMFactoryOptions, LLMProvider } from './types';
import { createAnthropicProvider } from './anthropic';
import { createOpenAICompatibleProvider } from './openai';

export * from './types';
export { createAnthropicProvider };
export { createOpenAICompatibleProvider };

/**
 * Resolve an LLM provider. Priority:
 *   1. explicit `opts` overrides
 *   2. environment variables (LLM_PROVIDER, LLM_MODEL, *_API_KEY)
 *
 * Throws if the resolved provider has no API key.
 */
export function getLLM(opts: LLMFactoryOptions = {}): LLMProvider {
  const provider = opts.provider ?? (process.env.LLM_PROVIDER as LLMFactoryOptions['provider']) ?? 'anthropic';
  const model = opts.model ?? process.env.LLM_MODEL;

  switch (provider) {
    case 'anthropic': {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
      return createAnthropicProvider({ apiKey, model });
    }
    case 'openai': {
      const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? '';
      return createOpenAICompatibleProvider({ apiKey, model });
    }
    case 'groq': {
      const apiKey = opts.apiKey ?? process.env.GROQ_API_KEY ?? '';
      return createOpenAICompatibleProvider({
        apiKey,
        model: model ?? 'llama-3.1-70b-versatile',
        baseUrl: 'https://api.groq.com/openai',
        name: 'groq',
      });
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
