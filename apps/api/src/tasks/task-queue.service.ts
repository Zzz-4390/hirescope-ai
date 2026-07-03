import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { TaskJobPayload } from '@hirescope/shared-types';

export interface TaskQueue { add(name: string, data: TaskJobPayload, options: { jobId: string }): Promise<unknown> }
export const TASK_QUEUE = Symbol('TASK_QUEUE');

@Injectable()
export class TaskQueueService implements OnModuleDestroy {
  constructor(@Inject(TASK_QUEUE) private readonly queue: TaskQueue) {}

  enqueue(type: string, taskId: string): Promise<unknown> {
    return this.queue.add(type, { taskId }, { jobId: taskId });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue instanceof Queue) await this.queue.close();
  }
}
