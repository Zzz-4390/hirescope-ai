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
    const response = { questions: [{ questionId: 'q1', points: rubric.map((point) => ({ point: point.point, covered: true, evidence: [answers[0]!.content] })) }] };
    const provider = providerReturning(JSON.stringify(response));
    const logs = { record: vi.fn().mockResolvedValue(undefined) };
    const report = await new AiInterviewReportService(provider as never, logs).generate(interview, questions, answers, { summary: 'must-not-reach-judge' }, context);
    expect(report.questionReviews[0]?.score).toBe(100);
    expect(report.questionReviews[0]?.answerEvidence).toEqual([answers[0]!.content]);
    expect(logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED', scene: 'INTERVIEW_REPORT_GENERATION' }));
    const request = provider.completeJson.mock.calls[0]![0];
    const prompt = JSON.parse(request.userPrompt);
    expect(request.temperature).toBe(0);
    expect(prompt.questions[0]).toEqual(expect.objectContaining({ question: questions[0]!.question, answer: answers[0]!.content, rubric: [expect.objectContaining({ point: '可扩展性', weight: 100, synonyms: expect.any(Array), criterion: expect.any(String) })] }));
    expect(request.userPrompt).not.toContain('must-not-reach-judge');
    expect(request.userPrompt).not.toContain('overallScore');
  });

  it('uses semantic coverage instead of awarding points for an exact but semantically wrong keyword mention', async () => {
    const misleadingQuestions = [{ ...questions[0]!, referencePoints: ['scalability'] }];
    const misleadingAnswers = [{ questionId: 'q1', content: 'The service name contains scalability, but the answer does not explain how scaling works.' }];
    const draft = new DeterministicInterviewReportService().generate(interview, misleadingQuestions, misleadingAnswers);
    expect(draft.questionReviews[0]!.score).toBe(100);
    const rubric = draft.questionReviews[0]!.rubric!;
    const response = { questions: [{ questionId: 'q1', points: rubric.map((point) => ({ point: point.point, covered: false, evidence: [] })) }] };
    const report = await new AiInterviewReportService(providerReturning(JSON.stringify(response)) as never, { record: vi.fn().mockResolvedValue(undefined) })
      .generate(interview, misleadingQuestions, misleadingAnswers, {}, context);
    expect(report.questionReviews[0]).toMatchObject({ score: 0, coveredPoints: [], answerEvidence: [] });
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

  it('rejects model-provided scores and evidence not present in the answer before falling back', async () => {
    const draft = new DeterministicInterviewReportService().generate(interview, questions, answers);
    const rubric = draft.questionReviews[0]!.rubric!;
    const invalid = { questions: [{ questionId: 'q1', score: 100, points: rubric.map((point) => ({ point: point.point, covered: true, score: point.weight, evidence: ['invented evidence'] })) }] };
    const provider = providerReturning(JSON.stringify(invalid));
    const logs = { record: vi.fn().mockResolvedValue(undefined) };
    const report = await new AiInterviewReportService(provider as never, logs).generate(interview, questions, answers, {}, context);
    expect(provider.completeJson).toHaveBeenCalledTimes(2);
    expect((report.questionReviews[0]?.answerEvidence ?? []).every((evidence) => answers[0]!.content.includes(evidence))).toBe(true);
    expect(logs.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_SCHEMA_INVALID' }));
  });

  it('rejects fabricated evidence and records the degradation reason before deterministic fallback', async () => {
    const draft = new DeterministicInterviewReportService().generate(interview, questions, answers);
    const rubric = draft.questionReviews[0]!.rubric!;
    const invalid = { questions: [{ questionId: 'q1', points: rubric.map((point) => ({ point: point.point, covered: true, evidence: ['The service uses Kubernetes autoscaling.'] })) }] };
    const provider = providerReturning(JSON.stringify(invalid));
    const logs = { record: vi.fn().mockResolvedValue(undefined) };
    const report = await new AiInterviewReportService(provider as never, logs).generate(interview, questions, answers, {}, context);
    expect(provider.completeJson).toHaveBeenCalledTimes(2);
    expect(report.questionReviews[0]!.answerEvidence?.every((evidence) => answers[0]!.content.includes(evidence))).toBe(true);
    expect(logs.record).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED', errorCode: 'AI_RESPONSE_EVIDENCE_INVALID' }));
  });
});

function providerReturning(content: string) {
  return { providerName: 'openai-compatible', model: 'test-model', completeJson: vi.fn().mockResolvedValue({ content, durationMs: 1, usage: {} }) };
}
