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
});
