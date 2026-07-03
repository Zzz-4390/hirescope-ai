import { TASK_QUEUE_NAME, TaskJobPayloadSchema, type ExtractionLimits } from '@hirescope/shared-types';
import { PrismaClient, TaskStatus, TaskType } from '@prisma/client';
import { Job, Queue, Worker } from 'bullmq';
import { ProjectAnalyzerService } from './analysis/project-analyzer.service';
import { ZipExtractorService } from './analysis/zip-extractor.service';
import { ProjectAnalysisProcessor } from './processors/project-analysis.processor';
import { ProjectCleanupProcessor } from './processors/project-cleanup.processor';
import { TaskRecoveryService } from './recovery/task-recovery.service';
import { StoragePathService } from './storage/storage-path.service';
import { DeterministicCodeReviewService } from './code-review/deterministic-code-review.service';
import { CodeReviewProcessor } from './processors/code-review.processor';
import { DeterministicInterviewQuestionService } from './interview/deterministic-interview-question.service';
import { InterviewQuestionProcessor } from './processors/interview-question.processor';

export function createTaskHandler(prisma: PrismaClient, analysis: ProjectAnalysisProcessor, cleanup: ProjectCleanupProcessor, codeReview?: CodeReviewProcessor, interviewQuestions?: InterviewQuestionProcessor) {
  return async (job: Job): Promise<void> => {
    const payload = TaskJobPayloadSchema.parse(job.data);
    let task = await prisma.asyncTask.findUnique({ where: { id: payload.taskId }, select: { type: true, status: true } });
    for (let attempt = 0; task?.status === TaskStatus.PENDING && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      task = await prisma.asyncTask.findUnique({ where: { id: payload.taskId }, select: { type: true, status: true } });
    }
    if (!task) throw new Error('TASK_NOT_FOUND');
    if (task.type === TaskType.PROJECT_ANALYSIS) return analysis.process(payload.taskId);
    if (task.type === TaskType.PROJECT_CLEANUP) return cleanup.process(payload.taskId);
    if (task.type === TaskType.CODE_REVIEW && codeReview) return codeReview.process(payload.taskId);
    if (task.type === TaskType.INTERVIEW_QUESTION_GENERATION && interviewQuestions) return interviewQuestions.process(payload.taskId);
    throw new Error('TASK_TYPE_UNSUPPORTED');
  };
}

export function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, db: Number(url.pathname.slice(1) || 0) };
}

export interface RuntimeOptions { redisUrl: string; storageRoot: string; queueName?: string; recoveryBatchSize: number; recoveryIntervalMs: number; limits: ExtractionLimits }

export async function startWorkerRuntime(options: RuntimeOptions) {
  const prisma = new PrismaClient();
  await prisma.$connect();
  const connection = redisConnection(options.redisUrl);
  const queue = new Queue(options.queueName ?? TASK_QUEUE_NAME, { connection });
  const paths = new StoragePathService(options.storageRoot);
  const analysis = new ProjectAnalysisProcessor(prisma, paths, new ZipExtractorService(options.limits), new ProjectAnalyzerService(options.limits.maxTextReadBytes));
  const cleanup = new ProjectCleanupProcessor(prisma, paths);
  const codeReview = new CodeReviewProcessor(prisma, new DeterministicCodeReviewService());
  const interviewQuestions = new InterviewQuestionProcessor(prisma, new DeterministicInterviewQuestionService());
  const recovery = new TaskRecoveryService(prisma, queue, options.recoveryBatchSize);
  const worker = new Worker(options.queueName ?? TASK_QUEUE_NAME, createTaskHandler(prisma, analysis, cleanup, codeReview, interviewQuestions), { connection, concurrency: 2 });
  worker.on('failed', (job) => console.error(`Worker job failed: ${job?.id ?? 'unknown'}`));
  await recovery.recoverBatch();
  const timer = setInterval(() => { void recovery.recoverBatch().catch(() => console.error('Task recovery pass failed')); }, options.recoveryIntervalMs);
  return { prisma, queue, worker, recovery, async close() { clearInterval(timer); await worker.close(); await queue.close(); await prisma.$disconnect(); } };
}
