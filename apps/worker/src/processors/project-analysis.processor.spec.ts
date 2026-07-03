import { ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectAnalysisProcessor } from './project-analysis.processor';

function task(status = TaskStatus.QUEUED) {
  return { id: 'task', type: TaskType.PROJECT_ANALYSIS, status, projectId: 'project', project: { id: 'project', status: ProjectStatus.QUEUED, zipStoragePath: 'projects/u/p/source.zip', extractStoragePath: null } };
}

describe('ProjectAnalysisProcessor', () => {
  it('cancels without analysis when the project is deleting at claim time', async () => {
    const tx = { project: { findUnique: vi.fn().mockResolvedValue({ status: ProjectStatus.DELETING }) }, asyncTask: { update: vi.fn(), updateMany: vi.fn() } };
    const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue(task()) }, $transaction: vi.fn((callback) => callback(tx)) };
    const extractor = { extract: vi.fn() };
    await new ProjectAnalysisProcessor(prisma as never, {} as never, extractor as never, {} as never).process('task');
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING' }) }));
  });

  it('records ANALYSIS_RESULT_INVALID and does not write project analysis', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ status: ProjectStatus.QUEUED }]), project: { findUnique: vi.fn().mockResolvedValue({ status: ProjectStatus.QUEUED }), update: vi.fn() }, asyncTask: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, projectAnalysis: { upsert: vi.fn() } };
    const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue(task()) }, $transaction: vi.fn((callback) => callback(tx)) };
    const paths = { resolveStoredPath: vi.fn((value) => value) };
    const extractor = { extract: vi.fn().mockResolvedValue({}) };
    const analyzer = { analyze: vi.fn().mockResolvedValue({ summary: 'incomplete' }) };
    await new ProjectAnalysisProcessor(prisma as never, paths as never, extractor as never, analyzer as never).process('task');
    expect(tx.projectAnalysis.upsert).not.toHaveBeenCalled();
    expect(tx.asyncTask.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.FAILED, failureCode: 'ANALYSIS_RESULT_INVALID' }) }));
  });
});
