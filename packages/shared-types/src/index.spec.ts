import { describe, expect, it } from 'vitest';
import { CodeReviewResultSchema, InterviewQuestionsResultSchema, InterviewReportResultSchema, ProjectAnalysisResultSchema, TaskJobPayloadSchema, extractionLimitsFromEnv } from './index';

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

describe('InterviewQuestionsResultSchema', () => {
  it('accepts strict sequential interview questions', () => {
    const result = { questions: [{ sequence: 1, category: 'architecture', difficulty: 'MEDIUM', question: 'How is the API structured?', referencePoints: ['module boundaries'] }] };
    expect(InterviewQuestionsResultSchema.safeParse(result).success).toBe(true);
    expect(InterviewQuestionsResultSchema.safeParse({ questions: [{ ...result.questions[0], internal: true }] }).success).toBe(false);
  });
});

describe('InterviewReportResultSchema', () => {
  const report = {
    overallScore: 82,
    summary: '候选人能够清晰说明项目实现。',
    dimensions: { projectUnderstanding: 84, technicalAccuracy: 82, communication: 80, problemSolving: 81 },
    questionReviews: [{ questionId: 'question-1', sequence: 1, score: 82, comment: '回答覆盖主要要点。', summary: '回答覆盖主要要点。', coveredPoints: ['JWT'], missedPoints: ['异常处理'], strengths: ['说明了 JWT'], improvements: ['补充异常处理'], improvedAnswerExample: '使用 JWT 认证并统一处理异常。', matchedReferencePoints: 1, totalReferencePoints: 2 }],
    strengths: ['能够结合项目说明关键设计。'],
    improvements: ['可以补充异常处理细节。'],
    model: 'deterministic-interview-report-v1',
  };

  it('accepts the strict deterministic report contract', () => {
    expect(InterviewReportResultSchema.parse(report)).toEqual(report);
  });

  it('rejects invalid scores, empty lists, wrong models, and extra fields', () => {
    expect(InterviewReportResultSchema.safeParse({ ...report, overallScore: 101 }).success).toBe(false);
    expect(InterviewReportResultSchema.safeParse({ ...report, strengths: [] }).success).toBe(false);
    expect(InterviewReportResultSchema.safeParse({ ...report, model: 'other' }).success).toBe(false);
    expect(InterviewReportResultSchema.safeParse({ ...report, referencePoints: ['private'] }).success).toBe(false);
  });
});
