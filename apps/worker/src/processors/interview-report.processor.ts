import { InterviewReportResultSchema, type InterviewReportResult } from '@hirescope/shared-types';
import { InterviewStatus, Prisma, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import type { InterviewReportGenerator } from '../interview/interview-report-generator';

type LockedRows = { taskStatus: TaskStatus; interviewStatus: InterviewStatus; projectStatus: ProjectStatus };

export class InterviewReportProcessor {
  constructor(private readonly prisma: PrismaClient, private readonly generator: InterviewReportGenerator) {}

  async process(taskId: string): Promise<void> {
    const task = await this.prisma.asyncTask.findUnique({
      where: { id: taskId },
      include: {
        project: { select: { status: true, analysis: { select: { summary: true, techStack: true, coreModules: true } } } },
        interview: { select: { id: true, userId: true, status: true, questionCount: true, report: { select: { id: true } }, questions: { orderBy: { sequence: 'asc' }, select: { id: true, sequence: true, category: true, question: true, referencePoints: true, answer: { select: { questionId: true, content: true } } } } } },
      },
    });
    if (!task || task.type !== TaskType.INTERVIEW_REPORT_GENERATION || !task.projectId || !task.interviewId || !task.project || !task.interview) throw new Error('TASK_NOT_FOUND');
    if (task.interview.userId !== task.userId) throw new Error('TASK_OWNERSHIP_INVALID');
    if (task.status === TaskStatus.SUCCEEDED) return;
    if (task.interview.report && task.interview.status === InterviewStatus.COMPLETED) return this.markSucceeded(task.id);
    if (task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) return;
    if (task.status !== TaskStatus.QUEUED) return;
    if (!await this.claim(task.id, task.interviewId, task.projectId)) return;

    const questions = task.interview.questions.map((question) => ({ id: question.id, sequence: question.sequence, category: question.category, question: question.question, referencePoints: jsonStrings(question.referencePoints) }));
    const answers = task.interview.questions.flatMap((question) => question.answer ? [question.answer] : []);
    if (questions.length !== task.interview.questionCount || answers.length !== task.interview.questionCount) return this.fail(task.id, task.interviewId, 'INTERVIEW_REPORT_INPUT_INVALID');

    const candidate = await this.generator.generate(
      { id: task.interview.id, questionCount: task.interview.questionCount },
      questions,
      answers,
      task.project.analysis ?? {},
      { userId: task.userId, projectId: task.projectId, taskId: task.id },
    );
    const parsed = InterviewReportResultSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.questionReviews.length !== task.interview.questionCount || parsed.data.questionReviews.some((review) => !review.rubric || !review.answerEvidence)) return this.fail(task.id, task.interviewId, 'INTERVIEW_REPORT_RESULT_INVALID');
    await this.finish(task.id, task.interviewId, task.projectId, task.userId, parsed.data);
  }

  private claim(taskId: string, interviewId: string, projectId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockRows(tx, taskId, interviewId, projectId);
      if (!locked) throw new Error('TASK_NOT_FOUND');
      if (deleting(locked.projectStatus)) { await cancel(tx, taskId); return false; }
      if (locked.interviewStatus === InterviewStatus.COMPLETED && locked.taskStatus === TaskStatus.SUCCEEDED) return false;
      if (locked.interviewStatus !== InterviewStatus.REPORT_GENERATING) { await failRows(tx, taskId, interviewId, 'INTERVIEW_REPORT_INPUT_INVALID'); return false; }
      const claimed = await tx.asyncTask.updateMany({ where: { id: taskId, type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.QUEUED }, data: { status: TaskStatus.PROCESSING, progress: 5, attempts: { increment: 1 }, startedAt: new Date() } });
      return claimed.count === 1;
    });
  }

  private finish(taskId: string, interviewId: string, projectId: string, userId: string, report: InterviewReportResult): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockRows(tx, taskId, interviewId, projectId);
      if (!locked) throw new Error('TASK_NOT_FOUND');
      if (deleting(locked.projectStatus)) return cancel(tx, taskId);
      const existing = await tx.interviewReport.findUnique({ where: { interviewId }, select: { id: true } });
      if (!existing) {
        await tx.interviewReport.create({ data: { interviewId, userId, overallScore: report.overallScore, summary: report.summary, dimensions: report.dimensions as Prisma.InputJsonValue, questionReviews: report.questionReviews as Prisma.InputJsonValue, strengths: report.strengths as Prisma.InputJsonValue, improvements: report.improvements as Prisma.InputJsonValue, result: report as Prisma.InputJsonValue, model: report.model } });
      }
      const completedAt = new Date();
      await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.COMPLETED, failureCode: null, failureMessage: null, completedAt } });
      await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.SUCCEEDED, progress: 100, failureCode: null, failureMessage: null, completedAt } });
    });
  }

  private markSucceeded(taskId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => { await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.SUCCEEDED, progress: 100, failureCode: null, failureMessage: null, completedAt: new Date() } }); });
  }
  private fail(taskId: string, interviewId: string, code: string): Promise<void> { return this.prisma.$transaction((tx) => failRows(tx, taskId, interviewId, code)); }
}

function jsonStrings(value: Prisma.JsonValue): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.points)) {
    return value.points.filter((item): item is string => typeof item === 'string');
  }
  return [];
}
function deleting(status: ProjectStatus): boolean { return status === ProjectStatus.DELETING || status === ProjectStatus.DELETED; }
async function lockRows(tx: Prisma.TransactionClient, taskId: string, interviewId: string, projectId: string): Promise<LockedRows | null> {
  const rows = await tx.$queryRaw<LockedRows[]>(Prisma.sql`SELECT t.status AS "taskStatus", i.status AS "interviewStatus", p.status AS "projectStatus" FROM async_tasks t JOIN interviews i ON i.id = t.interview_id JOIN projects p ON p.id = t.project_id WHERE t.id = ${taskId}::uuid AND i.id = ${interviewId}::uuid AND p.id = ${projectId}::uuid FOR UPDATE OF t, i, p`);
  return rows[0] ?? null;
}
async function cancel(tx: Prisma.TransactionClient, taskId: string): Promise<void> { await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING', failureMessage: '项目正在删除', completedAt: new Date() } }); }
async function failRows(tx: Prisma.TransactionClient, taskId: string, interviewId: string, code: string): Promise<void> {
  const completedAt = new Date();
  await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.FAILED, failureCode: code, failureMessage: '面试报告生成失败', completedAt } });
  await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.FAILED, failureCode: code, failureMessage: '面试报告生成失败', completedAt } });
}
