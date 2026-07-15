import { describe, expect, it } from 'vitest';
import { DeterministicInterviewReportService } from './deterministic-interview-report.service';

const interview = { id: 'interview', questionCount: 2 };
const questions = [
  { id: 'q1', sequence: 1, question: '如何设计认证和异常处理？', referencePoints: ['JWT', '异常处理'] },
  { id: 'q2', sequence: 2, question: '如何保证数据库事务一致性？', referencePoints: ['事务', '行级锁'] },
];
const answers = [
  { questionId: 'q1', content: '使用 JWT 完成认证，并通过统一异常处理返回稳定错误码。' },
  { questionId: 'q2', content: '使用数据库事务和行级锁保证并发操作的一致性。' },
];

describe('DeterministicInterviewReportService', () => {
  it('scores semantic equivalents for Redis, BullMQ, transactions, authorization and idempotency with answer-only evidence', () => {
    const answer = 'We use a distributed cache backed by Redis. BullMQ runs the background queue. The write uses an ACID transaction and rollback. RBAC enforces authorization. An idempotency key deduplicates repeated requests.';
    const report = new DeterministicInterviewReportService().generate(
      { id: 'semantic', questionCount: 1 },
      [{ id: 'q', sequence: 1, question: 'Describe reliability controls.', referencePoints: ['Redis', 'BullMQ', '事务', '权限', '幂等'] }],
      [{ questionId: 'q', content: answer }],
    );
    const review = report.questionReviews[0]!;
    expect(review.score).toBe(100);
    expect(review.coveredPoints).toEqual(['Redis', 'BullMQ', '事务', '权限', '幂等']);
    expect((review.answerEvidence ?? []).every((evidence) => answer.includes(evidence))).toBe(true);
    expect(review.rubric?.every((point) => point.score <= point.weight && point.evidence.every((evidence) => answer.includes(evidence)))).toBe(true);
  });

  it('generates the same complete report for the same input', () => {
    const service = new DeterministicInterviewReportService();
    const first = service.generate(interview, questions, answers);
    expect(service.generate(interview, questions, answers)).toEqual(first);
    expect(first).toMatchObject({ model: 'deterministic-interview-report-v1', questionReviews: [{ questionId: 'q1', sequence: 1 }, { questionId: 'q2', sequence: 2 }] });
    expect(first.strengths.length).toBeGreaterThan(0);
    expect(first.improvements.length).toBeGreaterThan(0);
  });

  it('matches reference points case-insensitively and clamps all scores', () => {
    const report = new DeterministicInterviewReportService().generate(interview, questions, answers);
    expect(report.questionReviews[0]).toMatchObject({ matchedReferencePoints: 2, totalReferencePoints: 2 });
    for (const score of [report.overallScore, ...Object.values(report.dimensions), ...report.questionReviews.map((review) => review.score)]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(score)).toBe(true);
    }
  });

  it('creates independent, question-specific detail fields from each answer and project context', () => {
    const report = new DeterministicInterviewReportService().generate(interview, questions, [
      { questionId: 'q1', content: '认证使用 JWT，但还没有统一异常处理。' },
      { questionId: 'q2', content: '数据写入使用事务，并发更新还没有行级锁。' },
    ], { techStack: [{ name: 'NestJS' }], coreModules: [{ name: '订单模块' }] });
    const [authReview, transactionReview] = report.questionReviews;
    expect(authReview).not.toBe(transactionReview);
    expect(authReview!.coveredPoints).not.toBe(transactionReview!.coveredPoints);
    expect(authReview!.summary).toContain('JWT');
    expect(transactionReview!.summary).toContain('事务');
    expect(authReview!.missedPoints).toEqual(['异常处理']);
    expect(transactionReview!.missedPoints).toEqual(['行级锁']);
    expect(authReview!.improvements.join('')).toContain('NestJS');
    expect(authReview!.improvedAnswerExample).not.toBe(transactionReview!.improvedAnswerExample);
  });

  it('changes the per-question review when the answer quality changes', () => {
    const service = new DeterministicInterviewReportService();
    const complete = service.generate({ id: 'interview', questionCount: 1 }, [questions[0]!], [answers[0]!]);
    const incomplete = service.generate({ id: 'interview', questionCount: 1 }, [questions[0]!], [{ questionId: 'q1', content: '使用 JWT 认证。' }]);
    expect(complete.questionReviews[0]!.score).toBeGreaterThan(incomplete.questionReviews[0]!.score);
    expect(complete.questionReviews[0]!.coveredPoints).not.toEqual(incomplete.questionReviews[0]!.coveredPoints);
    expect(incomplete.questionReviews[0]!.missedPoints).toEqual(['异常处理']);
  });
});
