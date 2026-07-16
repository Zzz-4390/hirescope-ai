import { TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TaskRecoveryService } from './task-recovery.service';

const options = { batchSize: 100, queuedTimeoutMs: 60_000, processingTimeoutMs: 300_000, maxRecoveryAttempts: 3 };
const analysisTask = { id: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4', type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.PENDING, attempts: 0, projectId: 'project-id', codeReviewId: null, interviewId: null };
const reportTask = { id: '33a604c0-1924-4f57-97d3-1df9721e54a1', type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.PENDING, attempts: 0, projectId: 'project-id', codeReviewId: null, interviewId: 'interview-id' };
function transaction(tx: object) { return { $transaction: vi.fn((callback) => callback(tx)) }; }
function queue(getJob = vi.fn().mockResolvedValue(undefined), add = vi.fn().mockResolvedValue(undefined)) { return { getJob, add }; }

describe('TaskRecoveryService', () => {
  it('publishes a missing pending job with taskId-only payload before moving the task to QUEUED', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([analysisTask]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const publisher = queue();
    expect(await new TaskRecoveryService(transaction(tx) as never, publisher, options).recoverBatch()).toBe(1);
    expect(publisher.add).toHaveBeenCalledWith(TaskType.PROJECT_ANALYSIS, { taskId: analysisTask.id }, { jobId: analysisTask.id });
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: analysisTask.id, status: TaskStatus.PENDING }, data: expect.objectContaining({ status: TaskStatus.QUEUED, bullJobId: analysisTask.id }) }));
  });

  it('leaves database state unchanged when Redis job lookup is unavailable', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([analysisTask]), asyncTask: { updateMany: vi.fn() }, project: { updateMany: vi.fn() } };
    await new TaskRecoveryService(transaction(tx) as never, queue(vi.fn().mockRejectedValue(new Error('redis'))), options).recoverBatch();
    expect(tx.asyncTask.updateMany).not.toHaveBeenCalled();
  });

  it('leaves database state unchanged when Redis publication is unavailable', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([analysisTask]), asyncTask: { updateMany: vi.fn() }, project: { updateMany: vi.fn() } };
    await new TaskRecoveryService(transaction(tx) as never, queue(vi.fn().mockResolvedValue(undefined), vi.fn().mockRejectedValue(new Error('redis'))), options).recoverBatch();
    expect(tx.asyncTask.updateMany).not.toHaveBeenCalled();
  });

  it('does not publish a duplicate when the deterministic BullMQ job exists', async () => {
    const stale = { ...analysisTask, status: TaskStatus.QUEUED, attempts: 1 };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([stale]), asyncTask: { updateMany: vi.fn() }, project: { updateMany: vi.fn() } };
    const publisher = queue(vi.fn().mockResolvedValue({ getState: vi.fn().mockResolvedValue('waiting') }));
    expect(await new TaskRecoveryService(transaction(tx) as never, publisher, options).recoverBatch()).toBe(0);
    expect(publisher.add).not.toHaveBeenCalled();
    expect(tx.asyncTask.updateMany).not.toHaveBeenCalled();
  });

  it('repairs a pending database row when its BullMQ job already exists without duplicate publication', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([analysisTask]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const publisher = queue(vi.fn().mockResolvedValue({ getState: vi.fn() }));
    expect(await new TaskRecoveryService(transaction(tx) as never, publisher, options).recoverBatch()).toBe(1);
    expect(publisher.add).not.toHaveBeenCalled();
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ attempts: expect.anything() }) }));
  });

  it('requeues a stale processing task whose BullMQ job disappeared and increments recovery attempts', async () => {
    const stale = { ...analysisTask, status: TaskStatus.PROCESSING, attempts: 1 };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([stale]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const publisher = queue();
    expect(await new TaskRecoveryService(transaction(tx) as never, publisher, options).recoverBatch()).toBe(1);
    expect(publisher.add).toHaveBeenCalledWith(TaskType.PROJECT_ANALYSIS, { taskId: stale.id }, { jobId: stale.id });
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 }, status: TaskStatus.QUEUED }) }));
  });

  it('recovers a pending interview report task only after Redis publication succeeds', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([reportTask]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn() } };
    const publisher = queue();
    expect(await new TaskRecoveryService(transaction(tx) as never, publisher, options).recoverBatch()).toBe(1);
    expect(publisher.add).toHaveBeenCalledWith(TaskType.INTERVIEW_REPORT_GENERATION, { taskId: reportTask.id }, { jobId: reportTask.id });
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: reportTask.id, status: TaskStatus.PENDING }, data: expect.objectContaining({ status: TaskStatus.QUEUED, bullJobId: reportTask.id }) }));
  });

  it('marks an exhausted recovery as FAILED and exposes the terminal error on the business resource', async () => {
    const exhausted = { ...analysisTask, status: TaskStatus.PROCESSING, attempts: 3 };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([exhausted]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    expect(await new TaskRecoveryService(transaction(tx) as never, queue(), options).recoverBatch()).toBe(0);
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.FAILED, failureCode: 'TASK_RECOVERY_EXHAUSTED' }) }));
    expect(tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', failureCode: 'TASK_RECOVERY_EXHAUSTED' }) }));
  });

  it('fails a stale task with a terminal BullMQ job instead of leaving it queued forever', async () => {
    const stale = { ...analysisTask, status: TaskStatus.QUEUED, attempts: 1 };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([stale]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const publisher = queue(vi.fn().mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed') }));
    expect(await new TaskRecoveryService(transaction(tx) as never, publisher, options).recoverBatch()).toBe(0);
    expect(publisher.add).not.toHaveBeenCalled();
    expect(tx.asyncTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureCode: 'TASK_QUEUE_JOB_TERMINAL' }) }));
  });

  it('moves an exhausted cleanup task and its deleting project to FAILED', async () => {
    const exhausted = { ...analysisTask, type: TaskType.PROJECT_CLEANUP, status: TaskStatus.PROCESSING, attempts: 3 };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([exhausted]), asyncTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    expect(await new TaskRecoveryService(transaction(tx) as never, queue(), options).recoverBatch()).toBe(0);
    expect(tx.project.updateMany).toHaveBeenCalledWith({ where: { id: exhausted.projectId, status: 'DELETING' }, data: { status: 'FAILED', failureCode: 'TASK_RECOVERY_EXHAUSTED', failureMessage: '项目清理任务恢复失败' } });
  });
});
