import { ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CodeReviewsService } from './code-reviews.service';

describe('CodeReviewsService', () => {
  it('creates review and task atomically then queues both', async () => {
    const review = { id: 'review', status: TaskStatus.PENDING };
    const task = { id: 'task', type: TaskType.CODE_REVIEW, status: TaskStatus.PENDING };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.COMPLETED }]), asyncTask: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(task) }, codeReview: { create: vi.fn().mockResolvedValue(review), update: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (value) => typeof value === 'function' ? value(tx) : Promise.all(value)), asyncTask: { update: vi.fn() }, codeReview: { update: vi.fn() } };
    const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const result = await new CodeReviewsService(prisma as never, queue as never).create('user', 'project');
    expect(tx.codeReview.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: 'project', userId: 'user', status: TaskStatus.PENDING }) }));
    expect(tx.asyncTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ codeReviewId: 'review', type: TaskType.CODE_REVIEW }) }));
    expect(queue.enqueue).toHaveBeenCalledWith(TaskType.CODE_REVIEW, 'task');
    expect(result).toMatchObject({ id: 'review', status: TaskStatus.QUEUED, task: { id: 'task', status: TaskStatus.QUEUED } });
  });

  it('rejects an active review without creating records', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.COMPLETED }]), asyncTask: { findFirst: vi.fn().mockResolvedValue({ id: 'active' }), create: vi.fn() }, codeReview: { create: vi.fn() } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    await expect(new CodeReviewsService(prisma as never, {} as never).create('user', 'project')).rejects.toMatchObject({ status: 409 });
    expect(tx.codeReview.create).not.toHaveBeenCalled();
  });

  it('keeps both records pending when queue publication fails', async () => {
    const review = { id: 'review', status: TaskStatus.PENDING, summary: null, score: null, model: null, failureCode: null, failureMessage: null, createdAt: new Date(), completedAt: null };
    const task = { id: 'task', type: TaskType.CODE_REVIEW, status: TaskStatus.PENDING };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.COMPLETED }]), asyncTask: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(task) }, codeReview: { create: vi.fn().mockResolvedValue(review) } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)), asyncTask: { update: vi.fn() }, codeReview: { update: vi.fn() } };
    await expect(new CodeReviewsService(prisma as never, { enqueue: vi.fn().mockRejectedValue(new Error('redis')) } as never).create('user', 'project')).rejects.toMatchObject({ status: 503 });
    expect(prisma.asyncTask.update).not.toHaveBeenCalled(); expect(prisma.codeReview.update).not.toHaveBeenCalled();
  });
});
