import { describe, expect, it } from 'vitest';
import { CodeReviewResultSchema, ProjectAnalysisResultSchema, TaskJobPayloadSchema, extractionLimitsFromEnv } from './index';

describe('shared worker contracts', () => {
  it('accepts only taskId in a queue payload', () => {
    expect(TaskJobPayloadSchema.safeParse({ taskId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4' }).success).toBe(true);
    expect(TaskJobPayloadSchema.safeParse({ taskId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', projectId: 'secret' }).success).toBe(false);
  });

  it('uses conservative defaults and validates environment overrides', () => {
    expect(extractionLimitsFromEnv({})).toEqual({ zipMaxBytes: 50 * 1024 * 1024, maxFiles: 5000, maxSingleFileBytes: 2 * 1024 * 1024, maxExtractedBytes: 200 * 1024 * 1024, maxDepth: 30, maxTextReadBytes: 1024 * 1024 });
    expect(extractionLimitsFromEnv({ ZIP_MAX_FILES: '12' }).maxFiles).toBe(12);
    expect(() => extractionLimitsFromEnv({ ZIP_MAX_FILES: '0' })).toThrow();
  });

  it('rejects incomplete deterministic analysis results', () => {
    expect(ProjectAnalysisResultSchema.safeParse({ summary: 'x' }).success).toBe(false);
  });
});

describe('CodeReviewResultSchema', () => {
  it('accepts the complete strict deterministic review structure', () => {
    const result = { overview: 'Overview', strengths: ['Typed'], risks: ['Coverage'], suggestions: ['Add tests'], maintainability: { score: 80, summary: 'Clear' }, security: { score: 75, summary: 'Review inputs' }, performance: { score: 85, summary: 'Small project' } };
    expect(CodeReviewResultSchema.safeParse(result).success).toBe(true);
    expect(CodeReviewResultSchema.safeParse({ ...result, internalPrompt: 'secret' }).success).toBe(false);
  });
});
