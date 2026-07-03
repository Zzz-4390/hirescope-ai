import { Global, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TASK_QUEUE_NAME } from '@hirescope/shared-types';
import { TASK_QUEUE, TaskQueueService } from './task-queue.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

function connectionOptions() {
  const url = new URL(process.env.REDIS_URL!);
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, db: Number(url.pathname.slice(1) || 0) };
}

@Global()
@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    { provide: TASK_QUEUE, useFactory: () => new Queue(process.env.TASK_QUEUE_NAME ?? TASK_QUEUE_NAME, { connection: connectionOptions() }) },
    TaskQueueService,
  ],
  exports: [TaskQueueService],
})
export class TasksModule {}
