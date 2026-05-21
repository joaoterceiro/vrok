import type { LLMProvider, LLMRequest, LLMResponse, LLMToolCall } from './types';

interface AnthropicConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';

export function createAnthropicProvider(cfg: AnthropicConfig): LLMProvider {
  if (!cfg.apiKey) throw new Error('Anthropic provider: apiKey is required');
  const baseUrl = (cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  const model = cfg.model ?? DEFAULT_MODEL;

  return {
    name: 'anthropic',
    async generate(req: LLMRequest): Promise<LLMResponse> {
      const body: Record<string, unknown> = {
        model: req.model ?? model,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.4,
        system: req.system,
        messages: req.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
      };
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }));
      }

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
      }

      const j = (await res.json()) as {
        content: Array<{ type: 'text' | 'tool_use'; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
        stop_reason: string;
      };

      let text = '';
      const toolCalls: LLMToolCall[] = [];
      for (const block of j.content ?? []) {
        if (block.type === 'text' && block.text) text += block.text;
        if (block.type === 'tool_use' && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name, input: block.input ?? {} });
        }
      }
      return {
        text,
        toolCalls,
        finishReason: mapStop(j.stop_reason),
        raw: j,
      };
    },
  };
}

function mapStop(s: string): LLMResponse['finishReason'] {
  if (s === 'end_turn' || s === 'stop_sequence') return 'stop';
  if (s === 'tool_use') return 'tool_use';
  if (s === 'max_tokens') return 'length';
  return 'error';
}
