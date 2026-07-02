import { describe, expect, it, vi } from 'vitest';
import { TaskQueueService } from './task-queue.service';

describe('TaskQueueService', () => {
  it('publishes only taskId and uses it as the BullMQ job id', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new TaskQueueService({ add } as never);
    await service.enqueue('PROJECT_ANALYSIS', 'task-id');
    expect(add).toHaveBeenCalledWith('PROJECT_ANALYSIS', { taskId: 'task-id' }, { jobId: 'task-id' });
  });
});
