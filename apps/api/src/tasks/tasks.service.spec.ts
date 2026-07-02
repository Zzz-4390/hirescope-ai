import { describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  it('queries by both task id and current user and exposes a fixed response', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'task', type: 'PROJECT_ANALYSIS', status: 'QUEUED', progress: 0, failureCode: null, failureMessage: null, createdAt: new Date(0), completedAt: null });
    const service = new TasksService({ asyncTask: { findFirst } } as never);
    const result = await service.get('user', 'task');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task', userId: 'user' } }));
    expect(result).not.toHaveProperty('userId');
    expect(result.failure).toBeNull();
  });
});
