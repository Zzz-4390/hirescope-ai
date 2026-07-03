import { ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InterviewStatus, Prisma, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TaskQueueService } from '../tasks/task-queue.service';
import type { CreateInterviewDto } from './dto/create-interview.dto';
import type { ListInterviewsDto } from './dto/list-interviews.dto';
import { mapInterview, mapInterviewDetail } from './interview.mapper';

const ACTIVE = [TaskStatus.PENDING, TaskStatus.QUEUED, TaskStatus.PROCESSING];
const interviewSelect = { id: true, title: true, status: true, difficulty: true, questionCount: true, currentIndex: true, failureCode: true, failureMessage: true, startedAt: true, submittedAt: true, completedAt: true, createdAt: true, updatedAt: true } as const;
type LockedInterview = { status: InterviewStatus; questionCount: number; currentIndex: number };

@Injectable()
export class InterviewsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(TaskQueueService) private readonly queue: TaskQueueService) {}
  async create(userId: string, projectId: string, dto: CreateInterviewDto) {
    let records;
    try {
      records = await this.prisma.$transaction(async (tx) => {
        const projects = await tx.$queryRaw<Array<{ status: ProjectStatus }>>(Prisma.sql`SELECT status FROM projects WHERE id = ${projectId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`); const project = projects[0];
        if (!project || project.status === ProjectStatus.DELETING || project.status === ProjectStatus.DELETED) throw this.projectNotFound();
        if (project.status !== ProjectStatus.COMPLETED) throw new ConflictException({ code: 'PROJECT_NOT_READY', message: '项目分析尚未完成' });
        if (await tx.asyncTask.findFirst({ where: { projectId, type: TaskType.INTERVIEW_QUESTION_GENERATION, status: { in: ACTIVE } }, select: { id: true } })) throw this.activeTask();
        const interview = await tx.interview.create({ data: { userId, projectId, title: `${dto.difficulty} 模拟面试`, status: InterviewStatus.GENERATING, difficulty: dto.difficulty, questionCount: dto.questionCount }, select: interviewSelect });
        const task = await tx.asyncTask.create({ data: { userId, projectId, interviewId: interview.id, codeReviewId: undefined, type: TaskType.INTERVIEW_QUESTION_GENERATION, status: TaskStatus.PENDING }, select: { id: true, type: true, status: true } });
        return { interview, task };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.activeTask();
      const concurrent = await this.prisma.asyncTask.findFirst({ where: { projectId, type: TaskType.INTERVIEW_QUESTION_GENERATION, status: { in: ACTIVE } }, select: { id: true } }).catch(() => null); if (concurrent) throw this.activeTask(); throw error;
    }
    try {
      await this.queue.enqueue(TaskType.INTERVIEW_QUESTION_GENERATION, records.task.id);
      await this.prisma.asyncTask.update({ where: { id: records.task.id }, data: { status: TaskStatus.QUEUED, bullJobId: records.task.id } });
      return { ...mapInterview(records.interview), task: { ...records.task, status: TaskStatus.QUEUED } };
    } catch { throw new ServiceUnavailableException({ code: 'TASK_QUEUE_UNAVAILABLE', message: '任务队列暂时不可用' }); }
  }
  async list(userId: string, projectId: string, query: ListInterviewsDto) {
    await this.assertProject(userId, projectId); const where = { userId, projectId };
    const [items, total] = await this.prisma.$transaction([this.prisma.interview.findMany({ where, select: interviewSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.prisma.interview.count({ where })]);
    return { items: items.map(mapInterview), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
  async get(userId: string, interviewId: string) {
    const interview = await this.prisma.interview.findFirst({ where: { id: interviewId, userId }, select: { ...interviewSelect, questions: { orderBy: { sequence: 'asc' }, select: { id: true, sequence: true, category: true, difficulty: true, question: true, answer: { select: { content: true, answeredAt: true, updatedAt: true } } } }, _count: { select: { answers: true } }, asyncTasks: { where: { type: TaskType.INTERVIEW_QUESTION_GENERATION }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, progress: true, failureCode: true, failureMessage: true, createdAt: true, completedAt: true } } } });
    if (!interview) throw new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: '面试不存在' }); const { asyncTasks, ...fields } = interview; const task = asyncTasks[0];
    return { ...mapInterviewDetail(fields), task: task ? { id: task.id, status: task.status, progress: task.progress, createdAt: task.createdAt, completedAt: task.completedAt, failure: task.failureCode ? { code: task.failureCode, message: task.failureMessage } : null } : null };
  }
  async start(userId: string, interviewId: string) {
    await this.prisma.$transaction(async (tx) => { const interview = await lockInterview(tx, userId, interviewId); if (!interview) throw this.interviewNotFound(); if (interview.status === InterviewStatus.IN_PROGRESS) return; if (interview.status !== InterviewStatus.READY) throw new ConflictException({ code: 'INTERVIEW_NOT_READY', message: '当前面试状态不能开始' }); const count = await tx.interviewQuestion.count({ where: { interviewId } }); if (count !== interview.questionCount) throw new ConflictException({ code: 'INTERVIEW_QUESTIONS_NOT_READY', message: '面试题尚未准备完成' }); await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.IN_PROGRESS, startedAt: new Date() } }); }); return this.get(userId, interviewId);
  }
  async saveAnswer(userId: string, interviewId: string, questionId: string, content: string) {
    return this.prisma.$transaction(async (tx) => { const interview = await lockInterview(tx, userId, interviewId); if (!interview) throw this.interviewNotFound(); if (interview.status !== InterviewStatus.IN_PROGRESS) throw new ConflictException({ code: 'INTERVIEW_NOT_IN_PROGRESS', message: '当前面试状态不能保存答案' }); const question = await tx.interviewQuestion.findFirst({ where: { id: questionId, interviewId }, select: { sequence: true } }); if (!question) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND', message: '面试题不存在' }); const answer = await tx.interviewAnswer.upsert({ where: { questionId }, create: { questionId, interviewId, userId, content }, update: { content, answeredAt: new Date() }, select: { id: true, questionId: true, content: true, answeredAt: true, updatedAt: true } }); const currentIndex = Math.max(interview.currentIndex, question.sequence); if (currentIndex !== interview.currentIndex) await tx.interview.update({ where: { id: interviewId }, data: { currentIndex } }); return { ...answer, currentIndex }; });
  }
  async submit(userId: string, interviewId: string) {
    await this.prisma.$transaction(async (tx) => { const interview = await lockInterview(tx, userId, interviewId); if (!interview) throw this.interviewNotFound(); if (interview.status === InterviewStatus.SUBMITTED) return; if (interview.status !== InterviewStatus.IN_PROGRESS) throw new ConflictException({ code: 'INTERVIEW_NOT_IN_PROGRESS', message: '当前面试状态不能提交' }); const answeredCount = await tx.interviewAnswer.count({ where: { interviewId, userId } }); if (answeredCount !== interview.questionCount) throw new ConflictException({ code: 'INTERVIEW_NOT_COMPLETE', message: '请完成全部题目后再提交' }); await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.SUBMITTED, submittedAt: new Date(), currentIndex: interview.questionCount } }); }); return this.get(userId, interviewId);
  }
  private async assertProject(userId: string, projectId: string) { if (!await this.prisma.project.findFirst({ where: { id: projectId, userId, status: { notIn: [ProjectStatus.DELETING, ProjectStatus.DELETED] } }, select: { id: true } })) throw this.projectNotFound(); }
  private projectNotFound() { return new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: '项目不存在' }); }
  private activeTask() { return new ConflictException({ code: 'TASK_ALREADY_ACTIVE', message: '面试题生成任务已存在' }); }
  private interviewNotFound() { return new NotFoundException({ code: 'INTERVIEW_NOT_FOUND', message: '面试不存在' }); }
}
async function lockInterview(tx: Prisma.TransactionClient, userId: string, interviewId: string): Promise<LockedInterview | null> { const rows = await tx.$queryRaw<LockedInterview[]>(Prisma.sql`SELECT status, question_count AS "questionCount", current_index AS "currentIndex" FROM interviews WHERE id = ${interviewId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`); return rows[0] ?? null; }
