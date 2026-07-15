import { Prisma, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';

interface QueueJob { getState(): Promise<string> }
interface QueuePublisher {
  add(name: string, data: { taskId: string }, options: { jobId: string }): Promise<unknown>
  getJob(jobId: string): Promise<QueueJob | undefined>
}

interface RecoverableTask {
  id: string
  type: TaskType
  status: TaskStatus
  attempts: number
  projectId: string | null
  codeReviewId: string | null
  interviewId: string | null
}

export interface TaskRecoveryOptions {
  batchSize: number
  queuedTimeoutMs: number
  processingTimeoutMs: number
  maxRecoveryAttempts: number
}

const ACTIVE = [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.PROCESSING];

export class TaskRecoveryService {
  constructor(private readonly prisma: PrismaClient, private readonly queue: QueuePublisher, private readonly options: TaskRecoveryOptions) {}

  recoverBatch(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const tasks = await tx.$queryRaw<RecoverableTask[]>(Prisma.sql`
        SELECT id, type, status, attempts, project_id AS "projectId", code_review_id AS "codeReviewId", interview_id AS "interviewId"
        FROM async_tasks
        WHERE type IN ('PROJECT_ANALYSIS'::"TaskType", 'CODE_REVIEW'::"TaskType", 'INTERVIEW_QUESTION_GENERATION'::"TaskType", 'INTERVIEW_REPORT_GENERATION'::"TaskType", 'PROJECT_CLEANUP'::"TaskType")
          AND (
            status = 'PENDING'::"TaskStatus"
            OR (status = 'QUEUED'::"TaskStatus" AND updated_at <= NOW() - (${this.options.queuedTimeoutMs} * INTERVAL '1 millisecond'))
            OR (status = 'PROCESSING'::"TaskStatus" AND COALESCE(started_at, updated_at) <= NOW() - (${this.options.processingTimeoutMs} * INTERVAL '1 millisecond'))
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.options.batchSize}
      `);
      let recovered = 0;
      for (const task of tasks) {
        let job: QueueJob | undefined;
        try {
          job = await this.queue.getJob(task.id);
        } catch {
          continue;
        }

        if (job) {
          if (task.status === TaskStatus.PENDING) {
            await this.markQueued(tx, task, false);
            recovered += 1;
            continue;
          }
          let state: string;
          try {
            state = await job.getState();
          } catch {
            continue;
          }
          if (state === 'completed' || state === 'failed') {
            await this.markFailed(tx, task, 'TASK_QUEUE_JOB_TERMINAL');
          }
          continue;
        }

        if (task.status !== TaskStatus.PENDING && task.attempts >= this.options.maxRecoveryAttempts) {
          await this.markFailed(tx, task, 'TASK_RECOVERY_EXHAUSTED');
          continue;
        }
        try {
          await this.queue.add(task.type, { taskId: task.id }, { jobId: task.id });
          await this.markQueued(tx, task, task.status !== TaskStatus.PENDING);
          recovered += 1;
        } catch {
          // Redis publication must succeed before the database state moves.
        }
      }
      return recovered;
    }, { maxWait: 15_000, timeout: 15_000 });
  }

  private async markQueued(tx: Prisma.TransactionClient, task: RecoverableTask, countRecovery: boolean): Promise<void> {
    const updated = await tx.asyncTask.updateMany({
      where: { id: task.id, status: task.status },
      data: {
        status: TaskStatus.QUEUED,
        bullJobId: task.id,
        progress: 0,
        startedAt: null,
        completedAt: null,
        failureCode: null,
        failureMessage: null,
        ...(countRecovery ? { attempts: { increment: 1 } } : {}),
      },
    });
    if (updated.count !== 1) return;
    if (task.type === TaskType.PROJECT_ANALYSIS && task.projectId) {
      await tx.project.updateMany({ where: { id: task.projectId, status: { in: [ProjectStatus.UPLOADED, ProjectStatus.QUEUED, ProjectStatus.ANALYZING] } }, data: { status: ProjectStatus.QUEUED, failureCode: null, failureMessage: null } });
    }
    if (task.type === TaskType.CODE_REVIEW && task.codeReviewId) {
      await tx.codeReview.updateMany({ where: { id: task.codeReviewId, status: { in: ACTIVE } }, data: { status: TaskStatus.QUEUED, failureCode: null, failureMessage: null } });
    }
  }

  private async markFailed(tx: Prisma.TransactionClient, task: RecoverableTask, code: string): Promise<void> {
    const updated = await tx.asyncTask.updateMany({
      where: { id: task.id, status: task.status },
      data: { status: TaskStatus.FAILED, failureCode: code, failureMessage: '任务恢复失败，请重试', completedAt: new Date() },
    });
    if (updated.count !== 1) return;
    if (task.type === TaskType.PROJECT_ANALYSIS && task.projectId) {
      await tx.project.updateMany({ where: { id: task.projectId, status: { in: [ProjectStatus.UPLOADED, ProjectStatus.QUEUED, ProjectStatus.ANALYZING] } }, data: { status: ProjectStatus.FAILED, failureCode: code, failureMessage: '项目分析任务恢复失败' } });
    }
    if (task.type === TaskType.CODE_REVIEW && task.codeReviewId) {
      await tx.codeReview.updateMany({ where: { id: task.codeReviewId, status: { in: ACTIVE } }, data: { status: TaskStatus.FAILED, failureCode: code, failureMessage: '代码审查任务恢复失败', completedAt: new Date() } });
    }
    if (task.type === TaskType.INTERVIEW_QUESTION_GENERATION && task.interviewId) {
      await tx.interview.updateMany({ where: { id: task.interviewId, status: 'GENERATING' }, data: { status: 'FAILED', failureCode: code, failureMessage: '面试题生成任务恢复失败', completedAt: new Date() } });
    }
    if (task.type === TaskType.INTERVIEW_REPORT_GENERATION && task.interviewId) {
      await tx.interview.updateMany({ where: { id: task.interviewId, status: 'REPORT_GENERATING' }, data: { status: 'FAILED', failureCode: code, failureMessage: '面试报告任务恢复失败', completedAt: new Date() } });
    }
  }
}
