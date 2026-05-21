/**
 * Provider-agnostic LLM interface used by the bot worker.
 *
 * Implementations:
 *   - AnthropicProvider (Claude)
 *   - OpenAIProvider (GPT-4o family)
 *   - GroqProvider (Llama / Mixtral via Groq)
 *
 * The factory picks the impl based on env or per-flow config.
 */
export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMRequest {
  system?: string;
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: LLMToolSpec[];
}

export type LLMFinishReason = 'stop' | 'tool_use' | 'length' | 'error';

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  toolCalls: LLMToolCall[];
  finishReason: LLMFinishReason;
  /** Provider-specific raw response — handy for debugging/log. */
  raw?: unknown;
}

export interface LLMProvider {
  readonly name: 'anthropic' | 'openai' | 'groq';
  generate(req: LLMRequest): Promise<LLMResponse>;
}

export interface LLMFactoryOptions {
  provider?: 'anthropic' | 'openai' | 'groq';
  model?: string;
  apiKey?: string;
}
