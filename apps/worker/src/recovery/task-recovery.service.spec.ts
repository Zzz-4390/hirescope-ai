import { TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TaskRecoveryService } from './task-recovery.service';

describe('TaskRecoveryService', () => {
  it('locks eligible rows and publishes authoritative type with taskId-only payload and deterministic jobId', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', type: TaskType.PROJECT_ANALYSIS }]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    await new TaskRecoveryService(prisma as never, queue as never, 100).recoverBatch();
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(TaskType.PROJECT_ANALYSIS, { taskId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4' }, { jobId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4' });
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith({ where: { id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', status: TaskStatus.PENDING, bullJobId: null }, data: { status: TaskStatus.QUEUED, bullJobId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4' } });
  });

  it('leaves a task pending when Redis publication fails', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', type: TaskType.PROJECT_CLEANUP }]), asyncTask: { updateMany: vi.fn() } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    await new TaskRecoveryService(prisma as never, { add: vi.fn().mockRejectedValue(new Error('redis')) } as never, 100).recoverBatch();
    expect(tx.asyncTask.updateMany).not.toHaveBeenCalled();
  });

  it('reuses the same job id when a prior database transaction fails after publication', async () => {
    const row = { id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', type: TaskType.PROJECT_ANALYSIS };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([row]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    let attempt = 0;
    const prisma = { $transaction: vi.fn(async (callback) => { const result = await callback(tx); if (attempt++ === 0) throw new Error('commit failed'); return result; }) };
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const recovery = new TaskRecoveryService(prisma as never, queue as never, 100);
    await expect(recovery.recoverBatch()).rejects.toThrow('commit failed');
    await recovery.recoverBatch();
    expect(queue.add).toHaveBeenNthCalledWith(1, row.type, { taskId: row.id }, { jobId: row.id });
    expect(queue.add).toHaveBeenNthCalledWith(2, row.type, { taskId: row.id }, { jobId: row.id });
  });

  it('queues the related review when recovering a CODE_REVIEW task', async () => {
    const row = { id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', type: TaskType.CODE_REVIEW, codeReviewId: 'review-id' };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([row]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, codeReview: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    await new TaskRecoveryService(prisma as never, { add: vi.fn().mockResolvedValue(undefined) } as never, 100).recoverBatch();
    expect(tx.codeReview.updateMany).toHaveBeenCalledWith({ where: { id: 'review-id', status: TaskStatus.PENDING }, data: { status: TaskStatus.QUEUED } });
  });

  it('recovers interview question generation without changing interview status', async () => {
    const row = { id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', type: TaskType.INTERVIEW_QUESTION_GENERATION, codeReviewId: null };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([row]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, codeReview: { updateMany: vi.fn() }, interview: { updateMany: vi.fn() } };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) }; await new TaskRecoveryService(prisma as never, { add: vi.fn().mockResolvedValue(undefined) } as never, 100).recoverBatch();
    expect(tx.asyncTask.updateMany).toHaveBeenCalled(); expect(tx.interview.updateMany).not.toHaveBeenCalled();
  });
});
