import { Prisma, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CodeReviewProcessor } from './code-review.processor';

function task(projectStatus: ProjectStatus = ProjectStatus.COMPLETED, taskStatus: TaskStatus = TaskStatus.QUEUED, reviewStatus: TaskStatus = TaskStatus.QUEUED): any {
  return { id: 'task', type: TaskType.CODE_REVIEW, status: taskStatus, projectId: 'project', codeReviewId: 'review', codeReview: { id: 'review', status: reviewStatus }, project: { id: 'project', status: projectStatus, analysis: { techStack: [], coreModules: [], statistics: { totalFiles: 1, totalLines: 1, languages: {} } } } };
}
function setup(value: any = task(), generated: unknown = { summary: 'Stable review', score: 80, model: 'deterministic-code-review-v1', result: { overview: 'Overview', strengths: [], risks: [], suggestions: [], maintainability: { score: 80, summary: 'Good' }, security: { score: 80, summary: 'Good' }, performance: { score: 80, summary: 'Good' } } }) {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([{ reviewStatus: value.codeReview.status, projectStatus: value.project.status }]), asyncTask: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, codeReview: { update: vi.fn() } };
  const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue(value) }, $transaction: vi.fn((callback) => callback(tx)) };
  const reviewer = { review: vi.fn().mockReturnValue(generated) };
  return { tx, prisma, reviewer, processor: new CodeReviewProcessor(prisma as never, reviewer as never) };
}

describe('CodeReviewProcessor', () => {
  it('writes a valid deterministic result atomically', async () => {
    const { processor, tx } = setup(); await processor.process('task');
    expect(tx.codeReview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED, model: 'deterministic-code-review-v1', result: expect.any(Object) }) }));
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED, progress: 100 }) }));
  });
  it('cancels deleting projects without generating a result', async () => {
    const { processor, reviewer, tx } = setup(task(ProjectStatus.DELETING)); await processor.process('task');
    expect(reviewer.review).not.toHaveBeenCalled();
    expect(tx.codeReview.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.CANCELLED, result: Prisma.DbNull }) }));
  });
  it('fails invalid output without writing a result', async () => {
    const { processor, tx } = setup(task(), { summary: 'bad', score: 80, model: 'deterministic-code-review-v1', result: { overview: 'incomplete' } }); await processor.process('task');
    expect(tx.codeReview.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.FAILED, failureCode: 'CODE_REVIEW_RESULT_INVALID', result: Prisma.DbNull }) }));
  });
  it('is idempotent after success', async () => {
    const { processor, reviewer } = setup(task(ProjectStatus.COMPLETED, TaskStatus.SUCCEEDED, TaskStatus.SUCCEEDED)); await processor.process('task'); expect(reviewer.review).not.toHaveBeenCalled();
  });
  it('rejects a mismatched task type', async () => {
    const value = { ...task(), type: TaskType.PROJECT_ANALYSIS }; const { processor } = setup(value); await expect(processor.process('task')).rejects.toThrow('TASK_NOT_FOUND');
  });
});
