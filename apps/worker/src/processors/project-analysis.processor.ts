import { ProjectAnalysisResultSchema } from '@hirescope/shared-types';
import { Prisma, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { posix } from 'node:path';
import { rm } from 'node:fs/promises';
import { ProjectAnalyzerService } from '../analysis/project-analyzer.service';
import { ZipExtractorService } from '../analysis/zip-extractor.service';
import { StoragePathService } from '../storage/storage-path.service';

const TERMINAL = new Set<TaskStatus>([TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED]);
const SAFE_FAILURE_CODES = new Set(['ZIP_SIZE_EXCEEDED', 'ZIP_PATH_INVALID', 'ZIP_SYMLINK_REJECTED', 'ZIP_ENCRYPTED_REJECTED', 'ZIP_FILE_COUNT_EXCEEDED', 'ZIP_SINGLE_FILE_SIZE_EXCEEDED', 'ZIP_TOTAL_SIZE_EXCEEDED', 'ZIP_STREAM_SIZE_EXCEEDED', 'STORAGE_PATH_INVALID']);

class AnalysisFailure extends Error { constructor(readonly code: string) { super(code); } }

export class ProjectAnalysisProcessor {
  constructor(private readonly prisma: PrismaClient, private readonly paths: StoragePathService, private readonly extractor: ZipExtractorService, private readonly analyzer: ProjectAnalyzerService) {}

  async process(taskId: string): Promise<void> {
    const task = await this.prisma.asyncTask.findUnique({ where: { id: taskId }, include: { project: { select: { id: true, status: true, zipStoragePath: true, extractStoragePath: true } } } });
    if (!task || task.type !== TaskType.PROJECT_ANALYSIS || !task.projectId || !task.project) throw new Error('TASK_NOT_FOUND');
    if (TERMINAL.has(task.status)) return;
    if (task.status === TaskStatus.PENDING) throw new Error('TASK_NOT_READY');
    if (task.status === TaskStatus.QUEUED && !(await this.claim(task.id, task.projectId))) return;
    let target: string | undefined;
    try {
      if (!task.project.zipStoragePath) throw new AnalysisFailure('PROJECT_SOURCE_MISSING');
      const source = this.paths.resolveStoredPath(task.project.zipStoragePath);
      const extractStoragePath = posix.join(posix.dirname(task.project.zipStoragePath), 'extracted');
      target = this.paths.resolveStoredPath(extractStoragePath);
      await this.extractor.extract(source, target);
      const candidate = await this.analyzer.analyze(target);
      const parsed = ProjectAnalysisResultSchema.safeParse(candidate);
      if (!parsed.success) throw new AnalysisFailure('ANALYSIS_RESULT_INVALID');
      const completed = await this.finishSuccess(task.id, task.projectId, extractStoragePath, parsed.data);
      if (!completed) await rm(target, { recursive: true, force: true });
    } catch (error) {
      if (target) await rm(target, { recursive: true, force: true });
      await this.finishFailure(task.id, task.projectId, failureCode(error));
    }
  }

  private claim(taskId: string, projectId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { status: true } });
      if (!project) { await tx.asyncTask.update({ where: { id: taskId }, data: failed(TaskStatus.FAILED, 'PROJECT_NOT_FOUND') }); return false; }
      if (isDeleting(project.status)) { await tx.asyncTask.update({ where: { id: taskId }, data: failed(TaskStatus.CANCELLED, 'RESOURCE_DELETING') }); return false; }
      const claimed = await tx.asyncTask.updateMany({ where: { id: taskId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.QUEUED }, data: { status: TaskStatus.PROCESSING, progress: 5, attempts: { increment: 1 }, startedAt: new Date() } });
      if (claimed.count !== 1) return false;
      await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.ANALYZING, failureCode: null, failureMessage: null } });
      return true;
    });
  }

  private finishSuccess(taskId: string, projectId: string, extractStoragePath: string, result: ReturnType<typeof ProjectAnalysisResultSchema.parse>): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      if (!project || isDeleting(project.status)) { await tx.asyncTask.update({ where: { id: taskId }, data: failed(TaskStatus.CANCELLED, 'RESOURCE_DELETING') }); return false; }
      await tx.projectAnalysis.upsert({ where: { projectId }, create: { projectId, summary: result.summary, techStack: result.techStack as Prisma.InputJsonValue, directoryTree: result.directoryTree as Prisma.InputJsonValue, coreModules: result.coreModules as Prisma.InputJsonValue, entryFiles: result.entryFiles as Prisma.InputJsonValue, statistics: result.statistics as Prisma.InputJsonValue, analyzerVersion: result.analyzerVersion }, update: { summary: result.summary, techStack: result.techStack as Prisma.InputJsonValue, directoryTree: result.directoryTree as Prisma.InputJsonValue, coreModules: result.coreModules as Prisma.InputJsonValue, entryFiles: result.entryFiles as Prisma.InputJsonValue, statistics: result.statistics as Prisma.InputJsonValue, analyzerVersion: result.analyzerVersion } });
      await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.COMPLETED, extractStoragePath, failureCode: null, failureMessage: null } });
      await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.SUCCEEDED, progress: 100, completedAt: new Date(), failureCode: null, failureMessage: null } });
      return true;
    });
  }

  private finishFailure(taskId: string, projectId: string, code: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const project = await lockProject(tx, projectId);
      if (!project || isDeleting(project.status)) { await tx.asyncTask.update({ where: { id: taskId }, data: failed(TaskStatus.CANCELLED, 'RESOURCE_DELETING') }); return; }
      await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.FAILED, failureCode: code, failureMessage: '项目分析失败' } });
      await tx.asyncTask.update({ where: { id: taskId }, data: failed(TaskStatus.FAILED, code) });
    });
  }
}

function isDeleting(status: ProjectStatus): boolean { return status === ProjectStatus.DELETING || status === ProjectStatus.DELETED; }
function failed(status: TaskStatus, code: string) { return { status, failureCode: code, failureMessage: code === 'RESOURCE_DELETING' ? '项目正在删除' : '项目分析失败', completedAt: new Date() }; }
function failureCode(error: unknown): string {
  if (error instanceof AnalysisFailure) return error.code;
  if (error instanceof Error && SAFE_FAILURE_CODES.has(error.message)) return error.message;
  return 'PROJECT_ANALYSIS_FAILED';
}
async function lockProject(tx: Prisma.TransactionClient, projectId: string): Promise<{ status: ProjectStatus } | null> {
  const rows = await tx.$queryRaw<Array<{ status: ProjectStatus }>>(Prisma.sql`SELECT status FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`);
  return rows[0] ?? null;
}
