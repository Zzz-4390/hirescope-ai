import { Prisma, PrismaClient, TaskStatus, TaskType } from '@prisma/client';

interface QueuePublisher { add(name: string, data: { taskId: string }, options: { jobId: string }): Promise<unknown> }
interface RecoverableTask { id: string; type: TaskType }

export class TaskRecoveryService {
  constructor(private readonly prisma: PrismaClient, private readonly queue: QueuePublisher, private readonly batchSize: number) {}

  recoverBatch(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const tasks = await tx.$queryRaw<RecoverableTask[]>(Prisma.sql`
        SELECT id, type
        FROM async_tasks
        WHERE status = 'PENDING'::"TaskStatus"
          AND bull_job_id IS NULL
          AND type IN ('PROJECT_ANALYSIS'::"TaskType", 'PROJECT_CLEANUP'::"TaskType")
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.batchSize}
      `);
      let recovered = 0;
      for (const task of tasks) {
        try {
          await this.queue.add(task.type, { taskId: task.id }, { jobId: task.id });
          const updated = await tx.asyncTask.updateMany({ where: { id: task.id, status: TaskStatus.PENDING, bullJobId: null }, data: { status: TaskStatus.QUEUED, bullJobId: task.id } });
          recovered += updated.count;
        } catch { /* preserve PENDING/null for the next recovery pass */ }
      }
      return recovered;
    }, { maxWait: 15_000, timeout: 15_000 });
  }
}
