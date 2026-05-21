import type { LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from './types';

interface OpenAICompatibleConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Provider name to expose; default is 'openai' but Groq reuses this impl. */
  name?: 'openai' | 'groq';
}

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * OpenAI-compatible chat completions. Groq reuses the same wire protocol with
 * a different base URL and model names, so we share the implementation.
 */
export function createOpenAICompatibleProvider(cfg: OpenAICompatibleConfig): LLMProvider {
  if (!cfg.apiKey) throw new Error('OpenAI provider: apiKey is required');
  const baseUrl = (cfg.baseUrl ?? 'https://api.openai.com').replace(/\/+$/, '');
  const model = cfg.model ?? DEFAULT_MODEL;
  const name = cfg.name ?? 'openai';

  return {
    name,
    async generate(req: LLMRequest): Promise<LLMResponse> {
      const messages: Array<Record<string, unknown>> = [];
      if (req.system) messages.push({ role: 'system', content: req.system });
      for (const m of req.messages) {
        if (m.role === 'system') continue;
        messages.push({ role: m.role, content: m.content });
      }

      const body: Record<string, unknown> = {
        model: req.model ?? model,
        messages,
        temperature: req.temperature ?? 0.4,
        max_tokens: req.maxTokens ?? 1024,
      };
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));
      }

      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`${name} ${res.status}: ${t.slice(0, 500)}`);
      }

      const j = (await res.json()) as {
        choices: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
          finish_reason?: string;
        }>;
      };
      const choice = j.choices?.[0];
      const msg = choice?.message;
      const toolCalls: LLMToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: safeParseJson(tc.function.arguments),
      }));
      return {
        text: msg?.content ?? '',
        toolCalls,
        finishReason: mapStop(choice?.finish_reason ?? ''),
        raw: j,
      };
    },
  };
}

function mapStop(s: string): LLMResponse['finishReason'] {
  if (s === 'stop') return 'stop';
  if (s === 'tool_calls') return 'tool_use';
  if (s === 'length') return 'length';
  return 'error';
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
