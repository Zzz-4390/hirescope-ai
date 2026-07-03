import { ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InterviewStatus, Prisma, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TaskQueueService } from '../tasks/task-queue.service';

const ACTIVE_TASK_STATUSES = [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.PROCESSING];
const taskSelect = { id: true, type: true, status: true } as const;
const reportSelect = { id: true, overallScore: true, summary: true, dimensions: true, questionReviews: true, strengths: true, improvements: true, model: true, createdAt: true } as const;
type LockedInterview = { status: InterviewStatus; projectId: string };

@Injectable()
export class InterviewReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(TaskQueueService) private readonly queue: TaskQueueService) {}

  async create(userId: string, interviewId: string) {
    let records: { interview: { id: string; status: InterviewStatus }; task?: { id: string; type: TaskType; status: TaskStatus }; report?: unknown; publish: boolean };
    try {
      records = await this.prisma.$transaction(async (tx) => {
        const interview = await lockInterview(tx, userId, interviewId);
        if (!interview) throw this.notFound();
        if (interview.status === InterviewStatus.COMPLETED) {
          const report = await tx.interviewReport.findUnique({ where: { interviewId }, select: reportSelect });
          if (!report) throw this.reportNotFound();
          return { interview: { id: interviewId, status: InterviewStatus.COMPLETED }, report: publicReport(report), publish: false };
        }
        if (interview.status === InterviewStatus.REPORT_GENERATING) {
          const activeTask = await tx.asyncTask.findFirst({ where: { interviewId, userId, type: TaskType.INTERVIEW_REPORT_GENERATION, status: { in: ACTIVE_TASK_STATUSES } }, orderBy: { createdAt: 'desc' }, select: taskSelect });
          if (!activeTask) throw this.notAllowed();
          return { interview: { id: interviewId, status: InterviewStatus.REPORT_GENERATING }, task: activeTask, publish: false };
        }
        if (interview.status !== InterviewStatus.SUBMITTED) throw this.notAllowed();
        const existingTask = await tx.asyncTask.findFirst({ where: { interviewId, userId, type: TaskType.INTERVIEW_REPORT_GENERATION, status: { in: ACTIVE_TASK_STATUSES } }, select: taskSelect });
        if (existingTask) return { interview: { id: interviewId, status: InterviewStatus.REPORT_GENERATING }, task: existingTask, publish: false };
        const task = await tx.asyncTask.create({ data: { userId, projectId: interview.projectId, interviewId, type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.PENDING }, select: taskSelect });
        await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.REPORT_GENERATING, failureCode: null, failureMessage: null } });
        return { interview: { id: interviewId, status: InterviewStatus.REPORT_GENERATING }, task, publish: true };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const active = await this.findActiveTask(userId, interviewId).catch(() => null);
      if (active) return { interview: { id: interviewId, status: InterviewStatus.REPORT_GENERATING }, task: active };
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.activeTask();
      }
      throw error;
    }
    if (!records.publish || !records.task) return records.report ? { interview: records.interview, report: records.report } : { interview: records.interview, task: records.task };
    try {
      await this.queue.enqueue(TaskType.INTERVIEW_REPORT_GENERATION, records.task.id);
      await this.prisma.asyncTask.update({ where: { id: records.task.id }, data: { status: TaskStatus.QUEUED, bullJobId: records.task.id } });
      return { interview: records.interview, task: { ...records.task, status: TaskStatus.QUEUED } };
    } catch {
      throw new ServiceUnavailableException({ code: 'QUEUE_UNAVAILABLE', message: '报告生成队列暂时不可用' });
    }
  }

  async get(userId: string, interviewId: string) {
    const interview = await this.prisma.interview.findFirst({ where: { id: interviewId, userId }, select: { status: true, report: { select: reportSelect } } });
    if (!interview) throw this.notFound();
    if (interview.status === InterviewStatus.REPORT_GENERATING) return { status: InterviewStatus.REPORT_GENERATING, report: null };
    if (interview.status === InterviewStatus.COMPLETED) {
      if (!interview.report) throw this.reportNotFound();
      return { status: InterviewStatus.COMPLETED, report: publicReport(interview.report) };
    }
    if (interview.status === InterviewStatus.SUBMITTED) throw this.reportNotFound();
    throw this.notAllowed();
  }

  private findActiveTask(userId: string, interviewId: string) {
    return this.prisma.asyncTask.findFirst({ where: { userId, interviewId, type: TaskType.INTERVIEW_REPORT_GENERATION, status: { in: ACTIVE_TASK_STATUSES } }, select: taskSelect });
  }
  private notFound() { return new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: '面试不存在' }); }
  private reportNotFound() { return new NotFoundException({ code: 'INTERVIEW_REPORT_NOT_FOUND', message: '面试报告不存在' }); }
  private notAllowed() { return new ConflictException({ code: 'INTERVIEW_REPORT_NOT_ALLOWED', message: '当前面试状态不允许生成或查询报告' }); }
  private activeTask() { return new ConflictException({ code: 'INTERVIEW_REPORT_TASK_ALREADY_ACTIVE', message: '面试报告生成任务已存在' }); }
}

async function lockInterview(tx: Prisma.TransactionClient, userId: string, interviewId: string): Promise<LockedInterview | null> {
  const rows = await tx.$queryRaw<LockedInterview[]>(Prisma.sql`SELECT status, project_id AS "projectId" FROM interviews WHERE id = ${interviewId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`);
  return rows[0] ?? null;
}
function publicReport(report: Record<string, unknown>) {
  const { id, overallScore, summary, dimensions, questionReviews, strengths, improvements, model, createdAt } = report;
  return { id, overallScore, summary, dimensions, questionReviews, strengths, improvements, model, createdAt };
}
