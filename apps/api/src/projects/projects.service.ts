import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { TaskQueueService } from '../tasks/task-queue.service';
import type { CreateProjectDto, ListProjectsDto } from './dto/project.dto';
import { ProjectUploadService, type DiskUpload } from './project-upload.service';

const projectSelect = { id: true, name: true, description: true, originalFileName: true, fileSize: true, status: true, failureCode: true, failureMessage: true, createdAt: true, updatedAt: true } as const;

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectUploadService) private readonly uploads: ProjectUploadService,
    @Inject(TaskQueueService) private readonly queue: TaskQueueService,
  ) {}

  async create(userId: string, dto: CreateProjectDto, file: DiskUpload) {
    const projectId = randomUUID();
    const accepted = await this.uploads.accept(file, userId, projectId);
    let records;
    try {
      records = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({ data: { id: projectId, userId, name: dto.name, description: dto.description || null, originalFileName: file.originalname, zipStoragePath: accepted.storagePath, fileSize: BigInt(accepted.fileSize), fileHash: accepted.fileHash, status: ProjectStatus.UPLOADED }, select: projectSelect });
        const task = await tx.asyncTask.create({ data: { userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.PENDING }, select: { id: true, type: true, status: true } });
        return { project, task };
      });
    } catch (error) {
      await this.uploads.remove(accepted.absolutePath);
      throw error;
    }
    try {
      await this.queue.enqueue(TaskType.PROJECT_ANALYSIS, records.task.id);
      await this.prisma.$transaction([
        this.prisma.project.update({ where: { id: projectId }, data: { status: ProjectStatus.QUEUED } }),
        this.prisma.asyncTask.update({ where: { id: records.task.id }, data: { status: TaskStatus.QUEUED, bullJobId: records.task.id } }),
      ]);
      return { project: this.mapProject({ ...records.project, status: ProjectStatus.QUEUED }), task: { ...records.task, status: TaskStatus.QUEUED } };
    } catch {
      throw new ServiceUnavailableException({ code: 'TASK_QUEUE_UNAVAILABLE', message: '任务队列暂时不可用' });
    }
  }

  async list(userId: string, query: ListProjectsDto) {
    const where: Prisma.ProjectWhereInput = { userId, status: query.status ?? { not: ProjectStatus.DELETED } };
    if (query.keyword) where.OR = [{ name: { contains: query.keyword, mode: 'insensitive' } }, { description: { contains: query.keyword, mode: 'insensitive' } }];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({ where, select: projectSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.project.count({ where }),
    ]);
    return { items: items.map((item) => this.mapProject(item)), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async get(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId, status: { not: ProjectStatus.DELETED } }, select: projectSelect });
    if (!project) throw this.notFound();
    return this.mapProject(project);
  }

  async analysis(userId: string, projectId: string) {
    const owned = await this.prisma.project.findFirst({ where: { id: projectId, userId, status: { not: ProjectStatus.DELETED } }, select: { id: true } });
    if (!owned) throw this.notFound();
    const analysis = await this.prisma.projectAnalysis.findUnique({ where: { projectId }, select: { id: true, projectId: true, summary: true, techStack: true, directoryTree: true, coreModules: true, entryFiles: true, statistics: true, analyzerVersion: true, createdAt: true, updatedAt: true } });
    if (!analysis) throw new ConflictException({ code: 'PROJECT_ANALYSIS_NOT_READY', message: '项目分析尚未完成' });
    return analysis;
  }

  async remove(userId: string, projectId: string) {
    let task;
    try {
      task = await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({ where: { id: projectId, userId, status: { not: ProjectStatus.DELETED } }, select: { status: true } });
        if (!project) throw this.notFound();
        if (project.status === ProjectStatus.DELETING) throw this.activeTask();
        const changed = await tx.project.updateMany({ where: { id: projectId, userId, status: { notIn: [ProjectStatus.DELETING, ProjectStatus.DELETED] } }, data: { status: ProjectStatus.DELETING } });
        if (changed.count !== 1) throw this.activeTask();
        return tx.asyncTask.create({ data: { userId, projectId, type: TaskType.PROJECT_CLEANUP, status: TaskStatus.PENDING }, select: { id: true, type: true, status: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.activeTask();
      throw error;
    }
    try {
      await this.queue.enqueue(TaskType.PROJECT_CLEANUP, task.id);
      return await this.prisma.asyncTask.update({ where: { id: task.id }, data: { status: TaskStatus.QUEUED, bullJobId: task.id }, select: { id: true, type: true, status: true } });
    } catch {
      throw new ServiceUnavailableException({ code: 'TASK_QUEUE_UNAVAILABLE', message: '任务队列暂时不可用' });
    }
  }

  private mapProject<T extends { fileSize: bigint; failureCode: string | null; failureMessage: string | null }>(project: T) {
    const { failureCode, failureMessage, fileSize, ...fields } = project;
    return { ...fields, fileSize: Number(fileSize), failure: failureCode ? { code: failureCode, message: failureMessage } : null };
  }
  private notFound() { return new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: '项目不存在' }); }
  private activeTask() { return new ConflictException({ code: 'TASK_ALREADY_ACTIVE', message: '项目清理任务已存在' }); }
}
