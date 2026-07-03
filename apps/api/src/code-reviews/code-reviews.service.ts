import { ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TaskQueueService } from '../tasks/task-queue.service';
import { mapCodeReview } from './code-review.mapper';
import type { ListCodeReviewsDto } from './dto/list-code-reviews.dto';

const ACTIVE = [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.PROCESSING];
const reviewSelect = { id: true, status: true, summary: true, score: true, model: true, failureCode: true, failureMessage: true, createdAt: true, completedAt: true } as const;

@Injectable()
export class CodeReviewsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(TaskQueueService) private readonly queue: TaskQueueService) {}

  async create(userId: string, projectId: string) {
    let records;
    try {
      records = await this.prisma.$transaction(async (tx) => {
        const projects = await tx.$queryRaw<Array<{ status: ProjectStatus }>>(Prisma.sql`SELECT status FROM projects WHERE id = ${projectId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`);
        const project = projects[0];
        if (!project || project.status === ProjectStatus.DELETING || project.status === ProjectStatus.DELETED) throw this.notFound();
        if (project.status !== ProjectStatus.COMPLETED) throw new ConflictException({ code: 'PROJECT_NOT_READY', message: '项目分析尚未完成' });
        const active = await tx.asyncTask.findFirst({ where: { projectId, type: TaskType.CODE_REVIEW, status: { in: ACTIVE } }, select: { id: true } });
        if (active) throw this.activeTask();
        const review = await tx.codeReview.create({ data: { projectId, userId, status: TaskStatus.PENDING }, select: reviewSelect });
        const task = await tx.asyncTask.create({ data: { userId, projectId, codeReviewId: review.id, type: TaskType.CODE_REVIEW, status: TaskStatus.PENDING }, select: { id: true, type: true, status: true } });
        return { review, task };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.activeTask();
      const concurrent = await this.prisma.asyncTask.findFirst({ where: { projectId, type: TaskType.CODE_REVIEW, status: { in: ACTIVE } }, select: { id: true } }).catch(() => null);
      if (concurrent) throw this.activeTask();
      throw error;
    }
    try {
      await this.queue.enqueue(TaskType.CODE_REVIEW, records.task.id);
      await this.prisma.$transaction([
        this.prisma.asyncTask.update({ where: { id: records.task.id }, data: { status: TaskStatus.QUEUED, bullJobId: records.task.id } }),
        this.prisma.codeReview.update({ where: { id: records.review.id }, data: { status: TaskStatus.QUEUED } }),
      ]);
      return { ...mapCodeReview({ ...records.review, status: TaskStatus.QUEUED }), task: { ...records.task, status: TaskStatus.QUEUED } };
    } catch {
      throw new ServiceUnavailableException({ code: 'TASK_QUEUE_UNAVAILABLE', message: '任务队列暂时不可用' });
    }
  }

  async list(userId: string, projectId: string, query: ListCodeReviewsDto) {
    await this.assertOwnedProject(userId, projectId);
    const where = { userId, projectId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.codeReview.findMany({ where, select: reviewSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.codeReview.count({ where }),
    ]);
    return { items: items.map(mapCodeReview), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async get(userId: string, codeReviewId: string) {
    const review = await this.prisma.codeReview.findFirst({ where: { id: codeReviewId, userId }, select: { ...reviewSelect, result: true, asyncTasks: { where: { type: TaskType.CODE_REVIEW }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, progress: true, failureCode: true, failureMessage: true, createdAt: true, completedAt: true } } } });
    if (!review) throw new NotFoundException({ code: 'CODE_REVIEW_NOT_FOUND', message: '代码审查不存在' });
    const { asyncTasks, result, ...base } = review;
    const task = asyncTasks[0];
    const safeTask = task ? { id: task.id, status: task.status, progress: task.progress, createdAt: task.createdAt, completedAt: task.completedAt, failure: task.failureCode ? { code: task.failureCode, message: task.failureMessage } : null } : null;
    return { ...mapCodeReview(base), result: review.status === TaskStatus.SUCCEEDED ? result : null, task: safeTask };
  }

  private async assertOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, userId, status: { notIn: [ProjectStatus.DELETING, ProjectStatus.DELETED] } }, select: { id: true } });
    if (!project) throw this.notFound();
  }
  private notFound() { return new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: '项目不存在' }); }
  private activeTask() { return new ConflictException({ code: 'TASK_ALREADY_ACTIVE', message: '代码审查任务已存在' }); }
}
