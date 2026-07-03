import { CodeReviewResultSchema } from '@hirescope/shared-types';
import { Prisma, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import type { DeterministicCodeReviewService } from '../code-review/deterministic-code-review.service';

const TERMINAL = new Set<TaskStatus>([TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED]);
type Locked = { reviewStatus: TaskStatus; projectStatus: ProjectStatus };

export class CodeReviewProcessor {
  constructor(private readonly prisma: PrismaClient, private readonly reviewer: DeterministicCodeReviewService) {}
  async process(taskId: string): Promise<void> {
    const task = await this.prisma.asyncTask.findUnique({ where: { id: taskId }, include: { codeReview: { select: { id: true, status: true } }, project: { select: { id: true, status: true, analysis: { select: { techStack: true, coreModules: true, statistics: true } } } } } });
    if (!task || task.type !== TaskType.CODE_REVIEW || !task.codeReviewId || !task.codeReview || !task.projectId || !task.project) throw new Error('TASK_NOT_FOUND');
    if (task.status === TaskStatus.SUCCEEDED || task.codeReview.status === TaskStatus.SUCCEEDED) return;
    if (TERMINAL.has(task.status)) return;
    if (task.status === TaskStatus.PENDING) throw new Error('TASK_NOT_READY');
    if (!(await this.claim(task.id, task.codeReviewId, task.projectId))) return;
    if (!task.project.analysis) return this.fail(task.id, task.codeReviewId, 'PROJECT_ANALYSIS_MISSING');
    const generated = this.reviewer.review(task.project.analysis);
    const parsed = CodeReviewResultSchema.safeParse(generated.result);
    if (!parsed.success || !Number.isInteger(generated.score) || generated.score < 0 || generated.score > 100 || generated.model !== 'deterministic-code-review-v1') return this.fail(task.id, task.codeReviewId, 'CODE_REVIEW_RESULT_INVALID');
    await this.finish(task.id, task.codeReviewId, task.projectId, { ...generated, result: parsed.data });
  }
  private claim(taskId: string, reviewId: string, projectId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lock(tx, reviewId, projectId); if (!locked) throw new Error('TASK_NOT_FOUND');
      if (locked.reviewStatus === TaskStatus.SUCCEEDED) return false;
      if (deleting(locked.projectStatus)) { await cancel(tx, taskId, reviewId); return false; }
      if (locked.projectStatus !== ProjectStatus.COMPLETED) { await failRows(tx, taskId, reviewId, 'PROJECT_NOT_READY'); return false; }
      const claimed = await tx.asyncTask.updateMany({ where: { id: taskId, type: TaskType.CODE_REVIEW, status: TaskStatus.QUEUED }, data: { status: TaskStatus.PROCESSING, progress: 5, attempts: { increment: 1 }, startedAt: new Date() } });
      if (claimed.count !== 1) return false;
      await tx.codeReview.update({ where: { id: reviewId }, data: { status: TaskStatus.PROCESSING, failureCode: null, failureMessage: null } }); return true;
    });
  }
  private finish(taskId: string, reviewId: string, projectId: string, generated: { summary: string; score: number; model: string; result: ReturnType<typeof CodeReviewResultSchema.parse> }): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lock(tx, reviewId, projectId); if (!locked) throw new Error('TASK_NOT_FOUND');
      if (locked.reviewStatus === TaskStatus.SUCCEEDED) return;
      if (deleting(locked.projectStatus)) return cancel(tx, taskId, reviewId);
      const completedAt = new Date();
      await tx.codeReview.update({ where: { id: reviewId }, data: { status: TaskStatus.SUCCEEDED, summary: generated.summary, score: generated.score, result: generated.result as Prisma.InputJsonValue, model: generated.model, failureCode: null, failureMessage: null, completedAt } });
      await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.SUCCEEDED, progress: 100, failureCode: null, failureMessage: null, completedAt } });
    });
  }
  private fail(taskId: string, reviewId: string, code: string): Promise<void> { return this.prisma.$transaction((tx) => failRows(tx, taskId, reviewId, code)); }
}
function deleting(status: ProjectStatus) { return status === ProjectStatus.DELETING || status === ProjectStatus.DELETED; }
async function lock(tx: Prisma.TransactionClient, reviewId: string, projectId: string): Promise<Locked | null> { const rows = await tx.$queryRaw<Locked[]>(Prisma.sql`SELECT cr.status AS "reviewStatus", p.status AS "projectStatus" FROM code_reviews cr JOIN projects p ON p.id = cr.project_id WHERE cr.id = ${reviewId}::uuid AND p.id = ${projectId}::uuid FOR UPDATE OF cr, p`); return rows[0] ?? null; }
async function cancel(tx: Prisma.TransactionClient, taskId: string, reviewId: string) { const completedAt = new Date(); await tx.codeReview.update({ where: { id: reviewId }, data: { status: TaskStatus.CANCELLED, result: Prisma.DbNull, failureCode: 'RESOURCE_DELETING', failureMessage: '项目正在删除', completedAt } }); await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING', failureMessage: '项目正在删除', completedAt } }); }
async function failRows(tx: Prisma.TransactionClient, taskId: string, reviewId: string, code: string) { const completedAt = new Date(); await tx.codeReview.update({ where: { id: reviewId }, data: { status: TaskStatus.FAILED, result: Prisma.DbNull, failureCode: code, failureMessage: '代码审查失败', completedAt } }); await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.FAILED, failureCode: code, failureMessage: '代码审查失败', completedAt } }); }
