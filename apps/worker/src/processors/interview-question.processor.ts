import { InterviewQuestionsResultSchema } from '@hirescope/shared-types';
import { InterviewStatus, Prisma, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { InterviewQuestionGenerationError } from '../interview/ai-interview-question.service';
import { restrictInterviewQuestionEvidence, validateInterviewQuestionEvidence } from '../interview/interview-question-evidence';
import type { InterviewQuestionEvidenceContext, InterviewQuestionGenerator } from '../interview/interview-question-generator';
import { CodeReviewContextBuilder } from '../code-review/code-review-context-builder';
import { StoragePathService } from '../storage/storage-path.service';

const TERMINAL = new Set<TaskStatus>([TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELLED]);
type Locked = { interviewStatus: InterviewStatus; projectStatus: ProjectStatus };

export class InterviewQuestionProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generator: InterviewQuestionGenerator,
    private readonly paths?: StoragePathService,
    private readonly contextBuilder?: CodeReviewContextBuilder,
  ) {}

  async process(taskId: string): Promise<void> {
    const task = await this.prisma.asyncTask.findUnique({
      where: { id: taskId },
      include: {
        interview: { select: { id: true, status: true, questionCount: true, difficulty: true } },
        project: {
          select: {
            id: true,
            status: true,
            extractStoragePath: true,
            analysis: { select: { summary: true, techStack: true, directoryTree: true, coreModules: true, entryFiles: true, statistics: true } },
            codeReviews: { where: { status: TaskStatus.SUCCEEDED }, orderBy: { completedAt: 'desc' }, take: 1, select: { summary: true, result: true } },
          },
        },
      },
    });
    if (!task || task.type !== TaskType.INTERVIEW_QUESTION_GENERATION || !task.interviewId || !task.interview || !task.projectId || !task.project) throw new Error('TASK_NOT_FOUND');
    if (task.interview.status === InterviewStatus.READY || task.status === TaskStatus.SUCCEEDED) return;
    if (TERMINAL.has(task.status)) return;
    if (task.status === TaskStatus.PENDING) throw new Error('TASK_NOT_READY');
    if (!await this.claim(task.id, task.interviewId, task.projectId)) return;
    if (!task.project.analysis) return this.fail(task.id, task.interviewId, task.projectId, 'PROJECT_ANALYSIS_MISSING');

    let evidence: InterviewQuestionEvidenceContext;
    try {
      if (!task.project.extractStoragePath || !this.paths || !this.contextBuilder) throw new Error('INTERVIEW_QUESTION_EVIDENCE_MISSING');
      evidence = restrictInterviewQuestionEvidence(await this.contextBuilder.build(this.paths.resolveStoredPath(task.project.extractStoragePath), task.project.analysis));
      if (evidence.evidencePaths.length === 0) throw new Error('INTERVIEW_QUESTION_EVIDENCE_MISSING');
    } catch {
      return this.fail(task.id, task.interviewId, task.projectId, 'INTERVIEW_QUESTION_EVIDENCE_MISSING');
    }

    const questionCount = task.interview.questionCount;
    const difficulty = task.interview.difficulty;
    let candidate: unknown;
    try {
      candidate = await this.generator.generate(
        task.project.analysis,
        task.project.codeReviews[0] ?? null,
        questionCount,
        difficulty,
        { userId: task.userId, projectId: task.projectId, taskId: task.id },
        evidence,
      );
    } catch (error) {
      return this.fail(task.id, task.interviewId, task.projectId, error instanceof InterviewQuestionGenerationError ? error.code : 'INTERVIEW_QUESTION_GENERATION_FAILED');
    }

    const parsed = InterviewQuestionsResultSchema.safeParse(candidate);
    const valid = parsed.success
      && parsed.data.questions.length === questionCount
      && parsed.data.questions.every((question, index) => question.sequence === index + 1 && question.difficulty === difficulty);
    if (!valid || !parsed.success) return this.fail(task.id, task.interviewId, task.projectId, 'INTERVIEW_QUESTIONS_RESULT_INVALID');
    try {
      validateInterviewQuestionEvidence(parsed.data, evidence);
    } catch {
      return this.fail(task.id, task.interviewId, task.projectId, 'INTERVIEW_QUESTIONS_EVIDENCE_INVALID');
    }
    await this.finish(task.id, task.interviewId, task.projectId, parsed.data);
  }

  private claim(taskId: string, interviewId: string, projectId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lock(tx, taskId, interviewId, projectId);
      if (!locked) throw new Error('TASK_NOT_FOUND');
      if (locked.interviewStatus === InterviewStatus.READY) return false;
      if (deleting(locked.projectStatus)) { await cancelTask(tx, taskId, interviewId); return false; }
      if (locked.projectStatus !== ProjectStatus.COMPLETED) { await failRows(tx, taskId, interviewId, 'PROJECT_NOT_READY'); return false; }
      const claimed = await tx.asyncTask.updateMany({ where: { id: taskId, type: TaskType.INTERVIEW_QUESTION_GENERATION, status: TaskStatus.QUEUED }, data: { status: TaskStatus.PROCESSING, progress: 5, attempts: { increment: 1 }, startedAt: new Date() } });
      return claimed.count === 1;
    });
  }

  private finish(taskId: string, interviewId: string, projectId: string, result: ReturnType<typeof InterviewQuestionsResultSchema.parse>): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lock(tx, taskId, interviewId, projectId);
      if (!locked) throw new Error('TASK_NOT_FOUND');
      if (locked.interviewStatus === InterviewStatus.READY) return;
      if (deleting(locked.projectStatus)) return cancelTask(tx, taskId, interviewId);
      if (locked.projectStatus !== ProjectStatus.COMPLETED) return failRows(tx, taskId, interviewId, 'PROJECT_NOT_READY');
      await tx.interviewQuestion.createMany({
        data: result.questions.map((question) => ({
          interviewId,
          sequence: question.sequence,
          category: question.category,
          difficulty: question.difficulty,
          question: question.question,
          referencePoints: { points: question.referencePoints, evidencePaths: question.evidencePaths } as Prisma.InputJsonValue,
        })),
      });
      await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.READY, failureCode: null, failureMessage: null } });
      await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.SUCCEEDED, progress: 100, failureCode: null, failureMessage: null, completedAt: new Date() } });
    });
  }

  private fail(taskId: string, interviewId: string, projectId: string, code: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lock(tx, taskId, interviewId, projectId);
      if (!locked) throw new Error('TASK_NOT_FOUND');
      if (deleting(locked.projectStatus)) return cancelTask(tx, taskId, interviewId);
      await failRows(tx, taskId, interviewId, code);
    });
  }
}

function deleting(status: ProjectStatus) { return status === ProjectStatus.DELETING || status === ProjectStatus.DELETED; }
async function lock(tx: Prisma.TransactionClient, taskId: string, interviewId: string, projectId: string): Promise<Locked | null> {
  const rows = await tx.$queryRaw<Locked[]>(Prisma.sql`SELECT i.status AS "interviewStatus", p.status AS "projectStatus" FROM async_tasks t JOIN interviews i ON i.id = t.interview_id JOIN projects p ON p.id = t.project_id WHERE t.id = ${taskId}::uuid AND i.id = ${interviewId}::uuid AND p.id = ${projectId}::uuid FOR UPDATE OF t, i, p`);
  return rows[0] ?? null;
}
async function cancelTask(tx: Prisma.TransactionClient, taskId: string, interviewId: string) {
  await tx.interview.updateMany({
    where: { id: interviewId, status: InterviewStatus.GENERATING },
    data: { status: InterviewStatus.FAILED, failureCode: 'RESOURCE_DELETING', failureMessage: '项目正在删除', completedAt: new Date() },
  });
  await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING', failureMessage: '项目正在删除', completedAt: new Date() } });
}
async function failRows(tx: Prisma.TransactionClient, taskId: string, interviewId: string, code: string) {
  const completedAt = new Date();
  await tx.interview.update({ where: { id: interviewId }, data: { status: InterviewStatus.FAILED, failureCode: code, failureMessage: '面试题生成失败', completedAt } });
  await tx.asyncTask.update({ where: { id: taskId }, data: { status: TaskStatus.FAILED, failureCode: code, failureMessage: '面试题生成失败', completedAt } });
}
