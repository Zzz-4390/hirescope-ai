import { describe, expect, it, vi } from 'vitest';
import { chatCompletionsEndpoint, OpenAiCompatibleProvider } from './openai-compatible.provider';

const CONFIG = { baseUrl: 'https://provider.example/v1', apiKey: 'server-only-key', model: 'test-model' };

describe('OpenAiCompatibleProvider', () => {
  it.each([
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/', 'https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/chat/completions'],
    ['https://api.deepseek.com/chat/completions/', 'https://api.deepseek.com/chat/completions'],
    ['https://provider.example/v1', 'https://provider.example/v1/chat/completions'],
    ['https://provider.example/v1/chat/completions', 'https://provider.example/v1/chat/completions'],
  ])('normalizes %s without duplicating version or endpoint segments', (baseUrl, expected) => {
    expect(chatCompletionsEndpoint(baseUrl)).toBe(expected);
  });

  it('sends an authenticated JSON completion request and returns content with usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'actual-test-model',
      choices: [{ message: { content: '{"questions":[]}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const provider = new OpenAiCompatibleProvider(CONFIG, fetchImpl as typeof fetch);

    await expect(provider.completeJson({ systemPrompt: 'system', userPrompt: 'user' })).resolves.toMatchObject({
      content: '{"questions":[]}',
      model: 'actual-test-model',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://provider.example/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer server-only-key' }),
    }));
    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ model: 'test-model', response_format: { type: 'json_object' } });
  });

  it.each([
    [429, 'AI_RATE_LIMITED'],
    [500, 'AI_UPSTREAM_ERROR'],
  ])('maps HTTP %i to %s without exposing the upstream body', async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('secret upstream details', { status }));
    const provider = new OpenAiCompatibleProvider(CONFIG, fetchImpl as typeof fetch);
    await expect(provider.completeJson({ systemPrompt: 'system', userPrompt: 'user' })).rejects.toMatchObject({ code, httpStatus: status });
  });

  it('rejects an invalid provider response envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"choices":[]}', { status: 200 }));
    const provider = new OpenAiCompatibleProvider(CONFIG, fetchImpl as typeof fetch);
    await expect(provider.completeJson({ systemPrompt: 'system', userPrompt: 'user' })).rejects.toMatchObject({ code: 'AI_PROVIDER_RESPONSE_INVALID' });
  });

  it('aborts requests that exceed the timeout', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const provider = new OpenAiCompatibleProvider(CONFIG, fetchImpl as typeof fetch, 5);
    await expect(provider.completeJson({ systemPrompt: 'system', userPrompt: 'user' })).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT' });
  });
});
