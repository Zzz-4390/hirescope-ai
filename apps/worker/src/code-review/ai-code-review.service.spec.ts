import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../ai/openai-compatible.provider';
import { AiCodeReviewService } from './ai-code-review.service';

const CONTEXT = { userId: 'user', projectId: 'project', taskId: 'task' };
const ANALYSIS = { summary: 'NestJS worker', techStack: [{ name: 'TypeScript' }], coreModules: [{ name: 'Reviews' }], statistics: { totalFiles: 10 } };
const RESULT = {
  overview: 'The project has a clear worker boundary.',
  strengths: ['Clear module responsibilities.'],
  risks: ['Retry behavior needs monitoring.'],
  suggestions: ['Add failure-path integration coverage.'],
  maintainability: { score: 81, summary: 'Modules are separated.' },
  security: { score: 75, summary: 'Validate ownership and inputs.' },
  performance: { score: 78, summary: 'Measure queue throughput.' },
};

function setup(content = JSON.stringify(RESULT)) {
  const provider = {
    providerName: 'openai-compatible',
    model: 'configured-model',
    completeJson: vi.fn().mockResolvedValue({ content, model: 'actual-model', durationMs: 12, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } }),
  };
  const logs = { record: vi.fn().mockResolvedValue(undefined) };
  return { provider, logs, service: new AiCodeReviewService(provider as never, logs) };
}

describe('AiCodeReviewService', () => {
  it('generates a strict review and derives the existing summary and score fields', async () => {
    const { service, provider, logs } = setup();
    await expect(service.review(ANALYSIS, CONTEXT)).resolves.toEqual({ summary: RESULT.overview, score: 78, model: 'actual-model', result: RESULT });
    expect(provider.completeJson).toHaveBeenCalledWith(expect.objectContaining({ userPrompt: expect.stringContaining('NestJS worker') }));
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', scene: 'CODE_REVIEW', model: 'actual-model', totalTokens: 30 }));
    expect(logs.record.mock.calls[0]![0]).not.toHaveProperty('apiKey');
    expect(logs.record.mock.calls[0]![0]).not.toHaveProperty('prompt');
  });

  it('rejects illegal JSON with a safe failure code', async () => {
    const { service, logs } = setup('```json\n{}\n```');
    await expect(service.review(ANALYSIS, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_JSON_INVALID' });
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_JSON_INVALID' }));
  });

  it('rejects missing and extra fields through the strict Zod schema', async () => {
    const missing = setup(JSON.stringify({ ...RESULT, security: undefined }));
    await expect(missing.service.review(ANALYSIS, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_SCHEMA_INVALID' });
    const extra = setup(JSON.stringify({ ...RESULT, unexpected: true }));
    await expect(extra.service.review(ANALYSIS, CONTEXT)).rejects.toMatchObject({ code: 'AI_RESPONSE_SCHEMA_INVALID' });
  });

  it.each([
    ['AI_REQUEST_TIMEOUT', undefined],
    ['AI_RATE_LIMITED', 429],
    ['AI_UPSTREAM_ERROR', 503],
    ['AI_PROVIDER_RESPONSE_INVALID', 200],
  ] as const)('preserves provider failure %s', async (code, httpStatus) => {
    const { service, provider, logs } = setup();
    provider.completeJson.mockRejectedValue(new AiProviderError(code, 5, httpStatus));
    await expect(service.review(ANALYSIS, CONTEXT)).rejects.toMatchObject({ code, httpStatus });
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: code }));
  });
});
