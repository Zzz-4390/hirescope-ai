import { ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ProjectCleanupProcessor } from './project-cleanup.processor';

describe('ProjectCleanupProcessor', () => {
  it('repairs an unfinished cleanup task when the project is already deleted', async () => {
    const update = vi.fn();
    const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue({ id: 'task', type: TaskType.PROJECT_CLEANUP, status: TaskStatus.QUEUED, projectId: 'project', project: { status: ProjectStatus.DELETED, zipStoragePath: null, extractStoragePath: null } }), update } };
    await new ProjectCleanupProcessor(prisma as never, {} as never).process('task');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.SUCCEEDED, progress: 100 }) }));
  });
});
