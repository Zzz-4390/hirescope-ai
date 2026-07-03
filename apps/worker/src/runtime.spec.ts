import { TaskType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createTaskHandler } from './runtime';

describe('worker runtime routing', () => {
  it('routes by the PostgreSQL task type instead of the BullMQ job name', async () => {
    const analysis = { process: vi.fn() };
    const cleanup = { process: vi.fn() };
    const prisma = { asyncTask: { findUnique: vi.fn().mockResolvedValue({ type: TaskType.PROJECT_CLEANUP }) } };
    const handler = createTaskHandler(prisma as never, analysis as never, cleanup as never);
    await handler({ name: TaskType.PROJECT_ANALYSIS, data: { taskId: '8d73fbe6-0f0b-43fc-af01-81b0d7af76c4' } } as never);
    expect(cleanup.process).toHaveBeenCalledWith('8d73fbe6-0f0b-43fc-af01-81b0d7af76c4');
    expect(analysis.process).not.toHaveBeenCalled();
  });
});
