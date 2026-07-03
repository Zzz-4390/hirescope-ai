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
});
