import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../ai/openai-compatible.provider';
import { AiInterviewReportService } from './ai-interview-report.service';
import { DeterministicInterviewReportService } from './deterministic-interview-report.service';

const interview = { id: 'interview', questionCount: 1 };
const questions = [{ id: 'q1', sequence: 1, question: 'How do you scale this service?', referencePoints: ['可扩展性'] }];
const answers = [{ questionId: 'q1', content: 'The service scales horizontally by adding stateless workers behind a load balancer.' }];
const context = { userId: 'user', projectId: 'project', taskId: 'task' };

describe('AiInterviewReportService', () => {
  it('combines a valid semantic Judge result with deterministic scoring and preserves answer evidence', async () => {
    const draft = new DeterministicInterviewReportService().generate(interview, questions, answers);
    const rubric = draft.questionReviews[0]!.rubric!;
    const response = { questions: [{ questionId: 'q1', score: 100, points: rubric.map((point) => ({ point: point.point, score: point.weight, evidence: [answers[0]!.content] })) }] };
    const provider = providerReturning(JSON.stringify(response));
    const logs = { record: vi.fn().mockResolvedValue(undefined) };
    const report = await new AiInterviewReportService(provider as never, logs).generate(interview, questions, answers, {}, context);
    expect(report.questionReviews[0]?.score).toBe(100);
    expect(report.questionReviews[0]?.answerEvidence).toEqual([answers[0]!.content]);
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', scene: 'INTERVIEW_REPORT_GENERATION' }));
  });

  it('retries invalid JSON and then returns an explainable deterministic fallback without persisting an invalid Judge result', async () => {
    const provider = providerReturning('not-json');
    const logs = { record: vi.fn().mockResolvedValue(undefined) };
    const report = await new AiInterviewReportService(provider as never, logs).generate(interview, questions, answers, {}, context);
    expect(provider.completeJson).toHaveBeenCalledTimes(2);
    expect(report.questionReviews[0]?.rubric?.length).toBeGreaterThan(0);
    expect(report.questionReviews[0]?.summary).toContain('本题得分');
    expect(logs.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_JSON_INVALID' }));
  });

  it.each(['AI_RATE_LIMITED', 'AI_UPSTREAM_ERROR', 'AI_REQUEST_TIMEOUT'] as const)('falls back when the provider returns %s', async (code) => {
    const provider = { providerName: 'openai-compatible', model: 'test-model', completeJson: vi.fn().mockRejectedValue(new AiProviderError(code, 1, code === 'AI_RATE_LIMITED' ? 429 : 500)) };
    const logs = { record: vi.fn().mockResolvedValue(undefined) };
    const report = await new AiInterviewReportService(provider as never, logs).generate(interview, questions, answers, {}, context);
    expect(provider.completeJson).toHaveBeenCalledTimes(1);
    expect(report.questionReviews[0]?.rubric?.every((point) => point.score >= 0 && point.score <= point.weight)).toBe(true);
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: code }));
  });

  it('rejects out-of-range scores and evidence not present in the answer before falling back', async () => {
    const draft = new DeterministicInterviewReportService().generate(interview, questions, answers);
    const rubric = draft.questionReviews[0]!.rubric!;
    const invalid = { questions: [{ questionId: 'q1', score: 999, points: rubric.map((point) => ({ point: point.point, score: point.weight + 1, evidence: ['invented evidence'] })) }] };
    const provider = providerReturning(JSON.stringify(invalid));
    const report = await new AiInterviewReportService(provider as never, { record: vi.fn().mockResolvedValue(undefined) }).generate(interview, questions, answers, {}, context);
    expect(provider.completeJson).toHaveBeenCalledTimes(2);
    expect((report.questionReviews[0]?.answerEvidence ?? []).every((evidence) => answers[0]!.content.includes(evidence))).toBe(true);
  });
});

function providerReturning(content: string) {
  return { providerName: 'openai-compatible', model: 'test-model', completeJson: vi.fn().mockResolvedValue({ content, durationMs: 1, usage: {} }) };
}
