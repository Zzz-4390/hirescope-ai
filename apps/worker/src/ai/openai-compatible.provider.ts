export interface OpenAiCompatibleProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AiCompletion {
  content: string;
  durationMs: number;
  usage: AiTokenUsage;
  model?: string;
}

export type AiProviderFailureCode =
  | 'AI_REQUEST_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_PROVIDER_RESPONSE_INVALID';

export class AiProviderError extends Error {
  constructor(readonly code: AiProviderFailureCode, readonly durationMs: number, readonly httpStatus?: number) {
    super(code);
    this.name = 'AiProviderError';
  }
}

interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenAiCompatibleProvider {
  readonly providerName = 'openai-compatible';
  readonly model: string;
  private readonly endpoint: string;

  constructor(
    private readonly config: OpenAiCompatibleProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.model = config.model;
    this.endpoint = chatCompletionsEndpoint(config.baseUrl);
  }

  async completeJson(request: CompletionRequest): Promise<AiCompletion> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;
      if (response.status === 429) throw new AiProviderError('AI_RATE_LIMITED', durationMs, response.status);
      if (!response.ok) throw new AiProviderError('AI_UPSTREAM_ERROR', durationMs, response.status);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError('AI_PROVIDER_RESPONSE_INVALID', durationMs);
      }
      const parsed = parseCompletion(payload);
      if (!parsed) throw new AiProviderError('AI_PROVIDER_RESPONSE_INVALID', durationMs);
      return { ...parsed, durationMs };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const durationMs = Date.now() - startedAt;
      if (controller.signal.aborted) throw new AiProviderError('AI_REQUEST_TIMEOUT', durationMs);
      throw new AiProviderError('AI_UPSTREAM_ERROR', durationMs);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function chatCompletionsEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  return url.toString();
}

function parseCompletion(payload: unknown): Omit<AiCompletion, 'durationMs'> | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) return null;
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== 'string' || choice.message.content.length === 0) return null;
  const usage = isRecord(payload.usage) ? payload.usage : {};
  return {
    content: choice.message.content,
    model: typeof payload.model === 'string' && payload.model.length > 0 && payload.model.length <= 100 ? payload.model : undefined,
    usage: {
      promptTokens: nonnegativeInteger(usage.prompt_tokens),
      completionTokens: nonnegativeInteger(usage.completion_tokens),
      totalTokens: nonnegativeInteger(usage.total_tokens),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonnegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
