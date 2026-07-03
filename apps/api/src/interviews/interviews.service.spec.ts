import { InterviewDifficulty, InterviewStatus, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { InterviewsService } from './interviews.service';

describe('InterviewsService', () => {
  it('creates interview and task atomically then queues only the task', async () => {
    const interview = { id: 'interview', title: 'MEDIUM 模拟面试', status: InterviewStatus.GENERATING, difficulty: InterviewDifficulty.MEDIUM, questionCount: 8, currentIndex: 0, failureCode: null, failureMessage: null, createdAt: new Date(), updatedAt: new Date() };
    const task = { id: 'task', type: TaskType.INTERVIEW_QUESTION_GENERATION, status: TaskStatus.PENDING };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.COMPLETED }]), asyncTask: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(task) }, interview: { create: vi.fn().mockResolvedValue(interview) } };
    const prisma = { $transaction: vi.fn(async (value) => typeof value === 'function' ? value(tx) : Promise.all(value)), asyncTask: { update: vi.fn() }, interview: { update: vi.fn() } };
    const result = await new InterviewsService(prisma as never, { enqueue: vi.fn().mockResolvedValue(undefined) } as never).create('user', 'project', { questionCount: 8, difficulty: InterviewDifficulty.MEDIUM });
    expect(tx.interview.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.GENERATING, questionCount: 8 }) }));
    expect(tx.asyncTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: 'project', interviewId: 'interview', codeReviewId: undefined, status: TaskStatus.PENDING }) }));
    expect(result).toMatchObject({ id: 'interview', status: InterviewStatus.GENERATING, task: { status: TaskStatus.QUEUED } });
    expect(prisma.interview.update).not.toHaveBeenCalled();
  });

  it('rejects an active generation without creating an interview', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.COMPLETED }]), asyncTask: { findFirst: vi.fn().mockResolvedValue({ id: 'active' }) }, interview: { create: vi.fn() } };
    await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)) } as never, {} as never).create('user', 'project', { questionCount: 8, difficulty: InterviewDifficulty.MEDIUM })).rejects.toMatchObject({ status: 409 });
    expect(tx.interview.create).not.toHaveBeenCalled();
  });

  it('keeps interview generating and task pending when queue publication fails', async () => {
    const interview = { id: 'interview', title: 'MEDIUM 模拟面试', status: InterviewStatus.GENERATING, difficulty: InterviewDifficulty.MEDIUM, questionCount: 8, currentIndex: 0, failureCode: null, failureMessage: null, createdAt: new Date(), updatedAt: new Date() };
    const task = { id: 'task', type: TaskType.INTERVIEW_QUESTION_GENERATION, status: TaskStatus.PENDING };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.COMPLETED }]), asyncTask: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(task) }, interview: { create: vi.fn().mockResolvedValue(interview) } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)), asyncTask: { update: vi.fn() } };
    await expect(new InterviewsService(prisma as never, { enqueue: vi.fn().mockRejectedValue(new Error('redis')) } as never).create('user', 'project', { questionCount: 8, difficulty: InterviewDifficulty.MEDIUM })).rejects.toMatchObject({ status: 503 });
    expect(prisma.asyncTask.update).not.toHaveBeenCalled(); expect(interview.status).toBe(InterviewStatus.GENERATING);
  });

  it.each([[undefined, 404], [ProjectStatus.DELETING, 404], [ProjectStatus.DELETED, 404], [ProjectStatus.ANALYZING, 409]])('rejects unavailable project status %s', async (status, expected) => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue(status ? [{ status }] : []), asyncTask: { findFirst: vi.fn() } }; const prisma = { $transaction: vi.fn((callback) => callback(tx)), asyncTask: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(new InterviewsService(prisma as never, {} as never).create('user', 'project', { questionCount: 8, difficulty: InterviewDifficulty.MEDIUM })).rejects.toMatchObject({ status: expected });
  });

  it('starts a READY interview after verifying question count', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.READY, questionCount: 5 }]), interviewQuestion: { count: vi.fn().mockResolvedValue(5) }, interview: { update: vi.fn().mockResolvedValue({}) } };
    const service = new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)), interview: { findFirst: vi.fn().mockResolvedValue(detail(InterviewStatus.IN_PROGRESS)) } } as never, {} as never);
    const result = await service.start('user', 'interview'); expect(tx.interview.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.IN_PROGRESS, startedAt: expect.any(Date) }) })); expect(result.status).toBe(InterviewStatus.IN_PROGRESS);
  });

  it('starts idempotently when already IN_PROGRESS', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.IN_PROGRESS, questionCount: 5 }]), interview: { update: vi.fn() } }; const service = new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)), interview: { findFirst: vi.fn().mockResolvedValue(detail(InterviewStatus.IN_PROGRESS)) } } as never, {} as never); await service.start('user', 'interview'); expect(tx.interview.update).not.toHaveBeenCalled();
  });

  it('rejects start when questions are incomplete or state is invalid', async () => {
    const mismatch = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.READY, questionCount: 5 }]), interviewQuestion: { count: vi.fn().mockResolvedValue(4) } }; await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(mismatch)) } as never, {} as never).start('user', 'interview')).rejects.toMatchObject({ status: 409 });
    for (const status of [InterviewStatus.GENERATING, InterviewStatus.SUBMITTED]) { const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status, questionCount: 5 }]) }; await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)) } as never, {} as never).start('user', 'interview')).rejects.toMatchObject({ status: 409 }); }
  });

  it('upserts a trimmed answer and advances currentIndex monotonically', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.IN_PROGRESS, currentIndex: 3 }]), interviewQuestion: { findFirst: vi.fn().mockResolvedValue({ sequence: 2 }) }, interviewAnswer: { upsert: vi.fn().mockResolvedValue({ id: 'answer', questionId: 'question', content: 'answer', answeredAt: new Date(), updatedAt: new Date() }) }, interview: { update: vi.fn() } };
    const result = await new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)) } as never, {} as never).saveAnswer('user', 'interview', 'question', 'answer'); expect(tx.interviewAnswer.upsert).toHaveBeenCalled(); expect(tx.interview.update).not.toHaveBeenCalled(); expect(result.currentIndex).toBe(3);
  });

  it('rejects answers for wrong state, user, or question relation', async () => {
    for (const rows of [[], [{ status: InterviewStatus.READY, currentIndex: 0 }]]) { const tx = { $queryRaw: vi.fn().mockResolvedValue(rows) }; await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)) } as never, {} as never).saveAnswer('user', 'interview', 'question', 'answer')).rejects.toMatchObject({ status: rows.length ? 409 : 404 }); }
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.IN_PROGRESS, currentIndex: 0 }]), interviewQuestion: { findFirst: vi.fn().mockResolvedValue(null) } }; await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)) } as never, {} as never).saveAnswer('user', 'interview', 'question', 'answer')).rejects.toMatchObject({ status: 404 });
  });

  it('submits a complete interview and is idempotent after submission', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.IN_PROGRESS, questionCount: 5 }]), interviewAnswer: { count: vi.fn().mockResolvedValue(5) }, interview: { update: vi.fn() } }; const service = new InterviewsService({ $transaction: vi.fn((callback) => callback(tx)), interview: { findFirst: vi.fn().mockResolvedValue(detail(InterviewStatus.SUBMITTED)) } } as never, {} as never); const result = await service.submit('user', 'interview'); expect(tx.interview.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InterviewStatus.SUBMITTED, currentIndex: 5, submittedAt: expect.any(Date) }) })); expect(result.status).toBe(InterviewStatus.SUBMITTED);
    const submittedTx = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.SUBMITTED, questionCount: 5 }]), interview: { update: vi.fn() } }; await new InterviewsService({ $transaction: vi.fn((callback) => callback(submittedTx)), interview: { findFirst: vi.fn().mockResolvedValue(detail(InterviewStatus.SUBMITTED)) } } as never, {} as never).submit('user', 'interview'); expect(submittedTx.interview.update).not.toHaveBeenCalled();
  });

  it('rejects incomplete or invalid-state submission', async () => {
    const incomplete = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.IN_PROGRESS, questionCount: 5 }]), interviewAnswer: { count: vi.fn().mockResolvedValue(4) } }; await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(incomplete)) } as never, {} as never).submit('user', 'interview')).rejects.toMatchObject({ status: 409 });
    const ready = { $queryRaw: vi.fn().mockResolvedValue([{ status: InterviewStatus.READY, questionCount: 5 }]) }; await expect(new InterviewsService({ $transaction: vi.fn((callback) => callback(ready)) } as never, {} as never).submit('user', 'interview')).rejects.toMatchObject({ status: 409 });
  });
});

function detail(status: InterviewStatus): any { return { id: 'interview', title: 'Interview', status, difficulty: InterviewDifficulty.MEDIUM, questionCount: 5, currentIndex: status === InterviewStatus.SUBMITTED ? 5 : 0, failureCode: null, failureMessage: null, createdAt: new Date(), updatedAt: new Date(), questions: [], asyncTasks: [], _count: { answers: 0 } }; }
