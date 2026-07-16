import { Prisma, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { StoragePathService } from '../storage/storage-path.service';

const TERMINAL = new Set<TaskStatus>([TaskStatus.SUCCEEDED, TaskStatus.CANCELLED]);

export class ProjectCleanupProcessor {
  constructor(private readonly prisma: PrismaClient, private readonly paths: StoragePathService) {}

  async process(taskId: string): Promise<void> {
    const task = await this.prisma.asyncTask.findUnique({ where: { id: taskId }, include: { project: { select: { status: true, zipStoragePath: true, extractStoragePath: true } } } });
    if (!task || task.type !== TaskType.PROJECT_CLEANUP || !task.projectId || !task.project) throw new Error('TASK_NOT_FOUND');
    if (TERMINAL.has(task.status)) return;
    if (task.project.status === ProjectStatus.DELETED) { await this.markSucceeded(task.id); return; }
    if (task.status === TaskStatus.PENDING) throw new Error('TASK_NOT_READY');
    if (task.status !== TaskStatus.QUEUED) return;
    const claimed = await this.prisma.asyncTask.updateMany({ where: { id: task.id, status: TaskStatus.QUEUED }, data: { status: TaskStatus.PROCESSING, progress: 5, attempts: { increment: 1 }, startedAt: new Date() } });
    if (claimed.count !== 1) return;
    try {
      for (const storedPath of [task.project.zipStoragePath, task.project.extractStoragePath]) {
        if (!storedPath) continue;
        const absolute = this.paths.assertDeletable(this.paths.resolveStoredPath(storedPath));
        await rm(absolute, { recursive: true, force: true });
      }
      await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ status: ProjectStatus }>>(Prisma.sql`SELECT status FROM projects WHERE id = ${task.projectId!}::uuid FOR UPDATE`);
        if (rows[0]?.status !== ProjectStatus.DELETED) await tx.project.update({ where: { id: task.projectId! }, data: { status: ProjectStatus.DELETED, zipStoragePath: null, extractStoragePath: null, failureCode: null, failureMessage: null } });
        await tx.asyncTask.update({ where: { id: task.id }, data: { status: TaskStatus.SUCCEEDED, progress: 100, completedAt: new Date(), failureCode: null, failureMessage: null } });
      });
    } catch {
      await this.prisma.asyncTask.update({ where: { id: task.id }, data: { status: TaskStatus.FAILED, failureCode: 'PROJECT_CLEANUP_FAILED', failureMessage: '项目文件清理失败', completedAt: new Date() } });
    }
  }

  private async markSucceeded(taskId: string): Promise<void> {
    await this.prisma.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.SUCCEEDED, progress: 100, completedAt: new Date(), failureCode: null, failureMessage: null } });
  }
}
