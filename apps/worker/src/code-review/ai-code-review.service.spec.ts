import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../ai/openai-compatible.provider';
import { AiCodeReviewService } from './ai-code-review.service';

const CONTEXT = { userId: 'user', projectId: 'project', taskId: 'task' };
const ANALYSIS = { summary: 'NestJS worker', techStack: [{ name: 'TypeScript' }], coreModules: [{ name: 'Reviews' }], statistics: { totalFiles: 10 } };
const EVIDENCE = {
  techStack: ANALYSIS.techStack,
  directoryTree: [{ path: 'src/review.service.ts', type: 'file' as const }, { path: 'test/review.spec.ts', type: 'file' as const }],
  testFiles: ['test/review.spec.ts'], entryFiles: [], coreModules: [], configFiles: [],
  snippets: [{ path: 'src/review.service.ts', content: 'export class ReviewService {}', truncated: false }],
  evidencePaths: ['src/review.service.ts', 'test/review.spec.ts'],
  budget: { maxFileChars: 8000, maxSnippetChars: 48000, maxContextChars: 64000, usedSnippetChars: 29, usedContextChars: 500 },
};
const RESULT = {
  overview: 'The project has a clear worker boundary.',
  strengths: ['[src/review.service.ts] Clear module responsibilities.'],
  risks: ['[src/review.service.ts] Retry behavior needs monitoring.'],
  suggestions: ['[test/review.spec.ts] Add failure-path integration coverage.'],
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
    await expect(service.review(ANALYSIS, CONTEXT, EVIDENCE)).resolves.toEqual({ summary: RESULT.overview, score: 78, model: 'actual-model', result: RESULT });
    expect(provider.completeJson).toHaveBeenCalledWith(expect.objectContaining({ userPrompt: expect.stringContaining('test/review.spec.ts') }));
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', scene: 'CODE_REVIEW', model: 'actual-model', totalTokens: 30 }));
    expect(logs.record.mock.calls[0]![0]).not.toHaveProperty('apiKey');
    expect(logs.record.mock.calls[0]![0]).not.toHaveProperty('prompt');
  });

  it('falls back to an evidence-based deterministic result after repeated illegal JSON', async () => {
    const { service, logs } = setup('```json\n{}\n```');
    const generated = await service.review(ANALYSIS, CONTEXT, EVIDENCE);
    expect(generated.model).toBe('deterministic-code-review-v1');
    expect(generated.result.strengths[0]).toContain('[test/review.spec.ts]');
    expect(logs.record).toHaveBeenCalledTimes(2);
    expect(logs.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', retryCount: 1, errorCode: 'AI_RESPONSE_JSON_INVALID' }));
  });

  it('falls back when strict schema validation keeps failing', async () => {
    const missing = setup(JSON.stringify({ ...RESULT, security: undefined }));
    await expect(missing.service.review(ANALYSIS, CONTEXT, EVIDENCE)).resolves.toMatchObject({ model: 'deterministic-code-review-v1' });
    const extra = setup(JSON.stringify({ ...RESULT, unexpected: true }));
    await expect(extra.service.review(ANALYSIS, CONTEXT, EVIDENCE)).resolves.toMatchObject({ model: 'deterministic-code-review-v1' });
  });

  it.each([
    ['AI_REQUEST_TIMEOUT', undefined],
    ['AI_RATE_LIMITED', 429],
    ['AI_UPSTREAM_ERROR', 500],
  ] as const)('degrades provider failure %s to a deterministic evidence review', async (code, httpStatus) => {
    const { service, provider, logs } = setup();
    provider.completeJson.mockRejectedValue(new AiProviderError(code, 5, httpStatus));
    await expect(service.review(ANALYSIS, CONTEXT, EVIDENCE)).resolves.toMatchObject({ model: 'deterministic-code-review-v1', result: { strengths: [expect.stringContaining('[test/review.spec.ts]')] } });
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: code }));
  });

  it('retries fabricated paths and never returns them', async () => {
    const fabricated = { ...RESULT, risks: ['[src/invented.service.ts] Fabricated risk.'] };
    const { service, provider, logs } = setup(JSON.stringify(fabricated));
    provider.completeJson.mockResolvedValueOnce({ content: JSON.stringify(fabricated), model: 'actual-model', durationMs: 12, usage: {} })
      .mockResolvedValueOnce({ content: JSON.stringify(RESULT), model: 'actual-model', durationMs: 12, usage: {} });

    const generated = await service.review(ANALYSIS, CONTEXT, EVIDENCE);

    expect(provider.completeJson).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generated.result)).not.toContain('invented.service.ts');
    expect(logs.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_EVIDENCE_INVALID', retryCount: 0 }));
    expect(logs.record).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: 'SUCCEEDED', retryCount: 1 }));
  });

  it('rejects a no-tests claim when test files are present', async () => {
    const invalid = { ...RESULT, overview: '项目没有测试文件。' };
    const { service } = setup(JSON.stringify(invalid));
    const generated = await service.review(ANALYSIS, CONTEXT, EVIDENCE);
    expect(generated.model).toBe('deterministic-code-review-v1');
    expect(JSON.stringify(generated.result)).not.toContain('没有测试');
    expect(generated.result.strengths[0]).toContain('[test/review.spec.ts]');
  });
});
