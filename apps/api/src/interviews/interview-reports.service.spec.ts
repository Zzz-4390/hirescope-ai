import { InterviewStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewReportsService } from './interview-reports.service';

const task = { id: 'task', type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.PENDING };

describe('InterviewReportsService', () => {
  it('creates the report task and REPORT_GENERATING transition in one transaction before enqueue', async () => {
    const tx = transaction(InterviewStatus.SUBMITTED);
    const prisma = { $transaction: vi.fn((callback) => callback(tx)), asyncTask: { update: vi.fn().mockResolvedValue({}) } };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const result = await new InterviewReportsService(prisma as never, queue as never).create('user', 'interview');
    expect(tx.asyncTask.create).toHaveBeenCalledWith({ data: { userId: 'user', projectId: 'project', interviewId: 'interview', type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.PENDING }, select: { id: true, type: true, status: true } });
    expect(tx.interview.update).toHaveBeenCalledWith({ where: { id: 'interview' }, data: { status: InterviewStatus.REPORT_GENERATING, failureCode: null, failureMessage: null, completedAt: null } });
    expect(queue.enqueue).toHaveBeenCalledWith(TaskType.INTERVIEW_REPORT_GENERATION, 'task');
    expect(prisma.asyncTask.update).toHaveBeenCalledWith({ where: { id: 'task' }, data: { status: TaskStatus.QUEUED, bullJobId: 'task' } });
    expect(result).toMatchObject({ interview: { status: InterviewStatus.REPORT_GENERATING }, task: { status: TaskStatus.QUEUED } });
  });

  it('returns the active report task idempotently without creating or republishing', async () => {
    const tx = transaction(InterviewStatus.REPORT_GENERATING);
    tx.asyncTask.findFirst.mockResolvedValue({ ...task, status: TaskStatus.QUEUED });
    const queue = { enqueue: vi.fn() };
    const result = await new InterviewReportsService({ $transaction: (callback: any) => callback(tx) } as never, queue as never).create('user', 'interview');
    expect(tx.asyncTask.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(result.task?.status).toBe(TaskStatus.QUEUED);
  });

  it('recovers a concurrent lock error by returning the task committed by the other request', async () => {
    const prisma = { $transaction: vi.fn().mockRejectedValue(new Error('lock timeout')), asyncTask: { findFirst: vi.fn().mockResolvedValue({ ...task, status: TaskStatus.QUEUED }) } };
    const result = await new InterviewReportsService(prisma as never, {} as never).create('user', 'interview');
    expect(result).toMatchObject({ interview: { status: InterviewStatus.REPORT_GENERATING }, task: { id: 'task', status: TaskStatus.QUEUED } });
  });

  it('preserves PENDING and REPORT_GENERATING when queue publication fails', async () => {
    const tx = transaction(InterviewStatus.SUBMITTED);
    const prisma = { $transaction: (callback: any) => callback(tx), asyncTask: { update: vi.fn() } };
    await expect(new InterviewReportsService(prisma as never, { enqueue: vi.fn().mockRejectedValue(new Error('redis')) } as never).create('user', 'interview')).rejects.toMatchObject({ status: 503 });
    expect(prisma.asyncTask.update).not.toHaveBeenCalled();
    expect(tx.interview.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.REPORT_GENERATING, completedAt: null }) }));
  });

  it('retries a FAILED interview by reusing it and creating one fresh active task', async () => {
    const tx = transaction(InterviewStatus.FAILED);
    const prisma = { $transaction: vi.fn((callback) => callback(tx)), asyncTask: { update: vi.fn().mockResolvedValue({}) } };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const result = await new InterviewReportsService(prisma as never, queue as never).create('user', 'interview');
    expect(tx.asyncTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.PROCESSING] } }) }));
    expect(tx.asyncTask.create).toHaveBeenCalledOnce();
    expect(tx.interview.update).toHaveBeenCalledWith({ where: { id: 'interview' }, data: { status: InterviewStatus.REPORT_GENERATING, failureCode: null, failureMessage: null, completedAt: null } });
    expect(result).toMatchObject({ interview: { id: 'interview', status: InterviewStatus.REPORT_GENERATING }, task: { status: TaskStatus.QUEUED } });
  });

  it('hides foreign interviews and rejects lifecycle states other than SUBMITTED or FAILED', async () => {
    await expect(new InterviewReportsService({ $transaction: (callback: any) => callback(transaction(null)) } as never, {} as never).create('user', 'interview')).rejects.toMatchObject({ status: 404 });
    for (const status of [InterviewStatus.READY, InterviewStatus.GENERATING, InterviewStatus.IN_PROGRESS]) {
      await expect(new InterviewReportsService({ $transaction: (callback: any) => callback(transaction(status)) } as never, {} as never).create('user', 'interview')).rejects.toMatchObject({ status: 409 });
    }
  });

  it('returns generating state and a safe completed report projection', async () => {
    const findFirst = vi.fn().mockResolvedValueOnce({ status: InterviewStatus.REPORT_GENERATING, report: null }).mockResolvedValueOnce({ status: InterviewStatus.COMPLETED, report: reportRow() });
    const service = new InterviewReportsService({ interview: { findFirst } } as never, {} as never);
    expect(await service.get('user', 'interview')).toEqual({ status: InterviewStatus.REPORT_GENERATING, report: null });
    const completed = await service.get('user', 'interview');
    expect(completed.status).toBe(InterviewStatus.COMPLETED);
    expect(completed.report).toMatchObject({ overallScore: 82, model: 'deterministic-interview-report-v1' });
    expect(completed.report).toMatchObject({ questionReviews: [expect.objectContaining({ summary: 'JWT 覆盖完整', coveredPoints: ['JWT'], missedPoints: [], strengths: ['认证方案清晰'], improvements: ['补充边界'], improvedAnswerExample: '使用 JWT 并处理失效场景。' })] });
    expect(completed.report).not.toHaveProperty('result');
    expect(JSON.stringify(completed)).not.toContain('referencePoints');
    expect(JSON.stringify(completed)).not.toContain('internal-rubric');
    expect(JSON.stringify(completed)).not.toContain('internal-evidence');
  });

  it('returns INTERVIEW_REPORT_NOT_FOUND for SUBMITTED without a report', async () => {
    const service = new InterviewReportsService({ interview: { findFirst: vi.fn().mockResolvedValue({ status: InterviewStatus.SUBMITTED, report: null }) } } as never, {} as never);
    await expect(service.get('user', 'interview')).rejects.toMatchObject({ status: 404, response: expect.objectContaining({ code: 'INTERVIEW_REPORT_NOT_FOUND' }) });
  });
});

function transaction(status: InterviewStatus | null) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(status ? [{ status, projectId: 'project' }] : []),
    asyncTask: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue(task) },
    interview: { update: vi.fn().mockResolvedValue({}) },
    interviewReport: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}
function reportRow() { return { id: 'report', overallScore: 82, summary: 'summary', dimensions: {}, questionReviews: [{ questionId: 'q1', sequence: 1, score: 82, comment: 'JWT 覆盖完整', summary: 'JWT 覆盖完整', coveredPoints: ['JWT'], missedPoints: [], strengths: ['认证方案清晰'], improvements: ['补充边界'], improvedAnswerExample: '使用 JWT 并处理失效场景。', matchedReferencePoints: 1, totalReferencePoints: 1, rubric: [{ point: 'internal-rubric' }], answerEvidence: ['internal-evidence'] }], strengths: ['s'], improvements: ['i'], result: { referencePoints: ['private'] }, model: 'deterministic-interview-report-v1', createdAt: new Date(0) }; }
