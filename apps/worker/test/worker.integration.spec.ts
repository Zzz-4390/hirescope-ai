import { DEFAULT_EXTRACTION_LIMITS, TASK_QUEUE_NAME } from '@hirescope/shared-types';
import { InterviewDifficulty, InterviewStatus, PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectAnalyzerService } from '../src/analysis/project-analyzer.service';
import { ZipExtractorService } from '../src/analysis/zip-extractor.service';
import { ProjectAnalysisProcessor } from '../src/processors/project-analysis.processor';
import { ProjectCleanupProcessor } from '../src/processors/project-cleanup.processor';
import { TaskRecoveryService } from '../src/recovery/task-recovery.service';
import { createTaskHandler, redisConnection } from '../src/runtime';
import { StoragePathService } from '../src/storage/storage-path.service';
import { DeterministicCodeReviewService } from '../src/code-review/deterministic-code-review.service';
import { CodeReviewContextBuilder } from '../src/code-review/code-review-context-builder';
import { CodeReviewProcessor } from '../src/processors/code-review.processor';
import { DeterministicInterviewQuestionService } from '../src/interview/deterministic-interview-question.service';
import { InterviewQuestionProcessor } from '../src/processors/interview-question.processor';
import { DeterministicInterviewReportService } from '../src/interview/deterministic-interview-report.service';
import { InterviewReportProcessor } from '../src/processors/interview-report.processor';

async function createZip(path: string, entries: Record<string, string>) {
  const zip = new ZipFile();
  for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content), name);
  zip.end(); const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(chunk as Buffer);
  await writeFile(path, Buffer.concat(chunks));
}

describe('Project Analysis Worker integration', () => {
  const prisma = new PrismaClient();
  const storageRoot = process.env.STORAGE_ROOT!;
  const paths = new StoragePathService(storageRoot);
  const analysis = new ProjectAnalysisProcessor(prisma, paths, new ZipExtractorService(DEFAULT_EXTRACTION_LIMITS), new ProjectAnalyzerService(DEFAULT_EXTRACTION_LIMITS.maxTextReadBytes));
  const cleanup = new ProjectCleanupProcessor(prisma, paths);
  const codeReview = new CodeReviewProcessor(prisma, new DeterministicCodeReviewService());
  const interviewQuestions = new InterviewQuestionProcessor(prisma, new DeterministicInterviewQuestionService(), paths, new CodeReviewContextBuilder());
  const interviewReports = new InterviewReportProcessor(prisma, new DeterministicInterviewReportService());
  const queue = new Queue(TASK_QUEUE_NAME, { connection: redisConnection(process.env.REDIS_URL!) });
  let userId: string;

  beforeAll(async () => { userId = (await prisma.user.create({ data: { username: 'worker_integration', email: 'worker-integration@example.com', passwordHash: 'test-only' } })).id; });
  afterAll(async () => { await queue.obliterate({ force: true }); await queue.close(); await prisma.user.deleteMany({ where: { email: 'worker-integration@example.com' } }); await prisma.$disconnect(); });

  it('analyzes once and remains idempotent on duplicate delivery', async () => {
    const projectId = randomUUID(); const taskId = randomUUID();
    const relativeZip = `projects/${userId}/${projectId}/source.zip`; const absoluteZip = paths.resolveStoredPath(relativeZip);
    await mkdir(join(absoluteZip, '..'), { recursive: true });
    await createZip(absoluteZip, { 'package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }), 'src/index.ts': 'export const app = true;\n' });
    await prisma.$transaction([
      prisma.project.create({ data: { id: projectId, userId, name: 'Analyze', originalFileName: 'source.zip', zipStoragePath: relativeZip, fileSize: BigInt((await stat(absoluteZip)).size), fileHash: 'a'.repeat(64), status: ProjectStatus.QUEUED } }),
      prisma.asyncTask.create({ data: { id: taskId, userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.QUEUED, bullJobId: taskId } }),
    ]);
    await analysis.process(taskId); await analysis.process(taskId);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe(ProjectStatus.COMPLETED);
    expect((await prisma.asyncTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe(TaskStatus.SUCCEEDED);
    expect(await prisma.projectAnalysis.count({ where: { projectId } })).toBe(1);
  });

  it('cancels analysis for a deleting project without writing results', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Deleting', originalFileName: 'source.zip', fileSize: 4n, fileHash: 'b'.repeat(64), status: ProjectStatus.DELETING } });
    const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.QUEUED } });
    await analysis.process(task.id);
    expect(await prisma.projectAnalysis.findUnique({ where: { projectId: project.id } })).toBeNull();
    expect(await prisma.asyncTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING' });
  });

  it('rechecks deletion after extraction and removes the uncommitted extract directory', async () => {
    const projectId = randomUUID(); const taskId = randomUUID();
    const relativeZip = `projects/${userId}/${projectId}/source.zip`; const absoluteZip = paths.resolveStoredPath(relativeZip);
    await mkdir(join(absoluteZip, '..'), { recursive: true }); await createZip(absoluteZip, { 'src/index.ts': 'export {}' });
    await prisma.$transaction([
      prisma.project.create({ data: { id: projectId, userId, name: 'Race', originalFileName: 'source.zip', zipStoragePath: relativeZip, fileSize: BigInt((await stat(absoluteZip)).size), fileHash: 'e'.repeat(64), status: ProjectStatus.QUEUED } }),
      prisma.asyncTask.create({ data: { id: taskId, userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.QUEUED } }),
    ]);
    const racingAnalyzer = { analyze: async (root: string) => { await prisma.project.update({ where: { id: projectId }, data: { status: ProjectStatus.DELETING } }); return new ProjectAnalyzerService(DEFAULT_EXTRACTION_LIMITS.maxTextReadBytes).analyze(root); } };
    await new ProjectAnalysisProcessor(prisma, paths, new ZipExtractorService(DEFAULT_EXTRACTION_LIMITS), racingAnalyzer as never).process(taskId);
    expect(await prisma.asyncTask.findUnique({ where: { id: taskId } })).toMatchObject({ status: TaskStatus.CANCELLED, failureCode: 'RESOURCE_DELETING' });
    expect(await prisma.projectAnalysis.findUnique({ where: { projectId } })).toBeNull();
    await expect(stat(paths.resolveStoredPath(`projects/${userId}/${projectId}/extracted`))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans project files idempotently and repairs terminal state', async () => {
    const projectId = randomUUID(); const taskId = randomUUID();
    const zipPath = `projects/${userId}/${projectId}/source.zip`; const extractPath = `projects/${userId}/${projectId}/extracted`;
    await mkdir(paths.resolveStoredPath(extractPath), { recursive: true }); await writeFile(paths.resolveStoredPath(zipPath), 'zip');
    await prisma.$transaction([
      prisma.project.create({ data: { id: projectId, userId, name: 'Cleanup', originalFileName: 'source.zip', zipStoragePath: zipPath, extractStoragePath: extractPath, fileSize: 3n, fileHash: 'c'.repeat(64), status: ProjectStatus.DELETING } }),
      prisma.asyncTask.create({ data: { id: taskId, userId, projectId, type: TaskType.PROJECT_CLEANUP, status: TaskStatus.QUEUED } }),
    ]);
    await cleanup.process(taskId); await cleanup.process(taskId);
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toMatchObject({ status: ProjectStatus.DELETED, zipStoragePath: null, extractStoragePath: null });
    await expect(readFile(paths.resolveStoredPath(zipPath))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers only pending tasks with deterministic BullMQ identity', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Recover', originalFileName: 'source.zip', fileSize: 4n, fileHash: 'd'.repeat(64), status: ProjectStatus.UPLOADED } });
    const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.PENDING } });
    expect(await new TaskRecoveryService(prisma, queue, 100).recoverBatch()).toBe(1);
    expect(await prisma.asyncTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: TaskStatus.QUEUED, bullJobId: task.id });
    expect((await queue.getJob(task.id))?.data).toEqual({ taskId: task.id });
  });

  it('uses row locks so concurrent recovery instances claim a pending task once', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Concurrent Recovery', originalFileName: 'source.zip', fileSize: 4n, fileHash: 'f'.repeat(64), status: ProjectStatus.UPLOADED } });
    const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.PENDING } });
    const results = await Promise.all([new TaskRecoveryService(prisma, queue, 100).recoverBatch(), new TaskRecoveryService(prisma, queue, 100).recoverBatch()]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect((await queue.getJob(task.id))?.data).toEqual({ taskId: task.id });
  });

  it('consumes a taskId-only BullMQ job end to end', async () => {
    await queue.drain(true);
    const projectId = randomUUID(); const taskId = randomUUID();
    const relativeZip = `projects/${userId}/${projectId}/source.zip`; const absoluteZip = paths.resolveStoredPath(relativeZip);
    await mkdir(join(absoluteZip, '..'), { recursive: true }); await createZip(absoluteZip, { 'src/main.ts': 'export const worker = true;' });
    await prisma.$transaction([
      prisma.project.create({ data: { id: projectId, userId, name: 'Queue E2E', originalFileName: 'source.zip', zipStoragePath: relativeZip, fileSize: BigInt((await stat(absoluteZip)).size), fileHash: '1'.repeat(64), status: ProjectStatus.QUEUED } }),
      prisma.asyncTask.create({ data: { id: taskId, userId, projectId, type: TaskType.PROJECT_ANALYSIS, status: TaskStatus.QUEUED, bullJobId: taskId } }),
    ]);
    const connection = redisConnection(process.env.REDIS_URL!);
    const events = new QueueEvents(TASK_QUEUE_NAME, { connection }); await events.waitUntilReady();
    const worker = new Worker(TASK_QUEUE_NAME, createTaskHandler(prisma, analysis, cleanup), { connection }); await worker.waitUntilReady();
    try {
      const job = await queue.add(TaskType.PROJECT_ANALYSIS, { taskId }, { jobId: taskId });
      await job.waitUntilFinished(events, 15_000);
      expect(await prisma.asyncTask.findUnique({ where: { id: taskId } })).toMatchObject({ status: TaskStatus.SUCCEEDED, progress: 100 });
    } finally { await worker.close(); await events.close(); }
  });

  it('consumes CODE_REVIEW and persists one deterministic result', async () => {
    await queue.drain(true);
    const project = await prisma.project.create({ data: { userId, name: 'Review Queue E2E', originalFileName: 'source.zip', fileSize: 4n, fileHash: '2'.repeat(64), status: ProjectStatus.COMPLETED, analysis: { create: { summary: 'Analyzed', techStack: [{ name: 'TypeScript', category: 'language' }], directoryTree: [], coreModules: [{ name: 'API', path: 'src/api', description: 'API' }], entryFiles: ['src/index.ts'], statistics: { totalFiles: 3, totalLines: 100, languages: { TypeScript: 100 } }, analyzerVersion: 'deterministic-v1' } } } });
    const review = await prisma.codeReview.create({ data: { userId, projectId: project.id, status: TaskStatus.QUEUED } });
    const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, codeReviewId: review.id, type: TaskType.CODE_REVIEW, status: TaskStatus.QUEUED } });
    const connection = redisConnection(process.env.REDIS_URL!); const events = new QueueEvents(TASK_QUEUE_NAME, { connection }); await events.waitUntilReady();
    const worker = new Worker(TASK_QUEUE_NAME, createTaskHandler(prisma, analysis, cleanup, codeReview), { connection }); await worker.waitUntilReady();
    try { const job = await queue.add(TaskType.CODE_REVIEW, { taskId: task.id }, { jobId: task.id }); await job.waitUntilFinished(events, 15_000); await codeReview.process(task.id); const stored = await prisma.codeReview.findUniqueOrThrow({ where: { id: review.id } }); expect(stored).toMatchObject({ status: TaskStatus.SUCCEEDED, model: 'deterministic-code-review-v1' }); expect(stored.result).toMatchObject({ overview: expect.any(String), security: expect.any(Object) }); expect(await prisma.codeReview.count({ where: { id: review.id } })).toBe(1); }
    finally { await worker.close(); await events.close(); }
  });

  it('consumes INTERVIEW_QUESTION_GENERATION and remains idempotent', async () => {
    await queue.drain(true); const projectId = randomUUID(); const extractStoragePath = `projects/${userId}/${projectId}/extracted`; const extractRoot = paths.resolveStoredPath(extractStoragePath); await mkdir(join(extractRoot, 'src'), { recursive: true }); await mkdir(join(extractRoot, 'test'), { recursive: true }); await writeFile(join(extractRoot, 'src', 'main.ts'), 'export async function bootstrap() { return true; }'); await writeFile(join(extractRoot, 'test', 'main.spec.ts'), 'describe("bootstrap", () => {});'); const project = await prisma.project.create({ data: { id: projectId, userId, name: 'Interview Queue E2E', originalFileName: 'source.zip', extractStoragePath, fileSize: 4n, fileHash: '3'.repeat(64), status: ProjectStatus.COMPLETED, analysis: { create: { summary: 'Analyzed', techStack: [{ name: 'TypeScript', category: 'language' }], directoryTree: [{ path: 'src/main.ts', type: 'file' }, { path: 'test/main.spec.ts', type: 'file' }], coreModules: [{ name: 'API', path: 'src', description: 'API' }], entryFiles: ['src/main.ts'], statistics: { totalFiles: 2, totalLines: 2, languages: { TypeScript: 2 } }, analyzerVersion: 'deterministic-v1' } } } });
    const interview = await prisma.interview.create({ data: { userId, projectId: project.id, title: 'MEDIUM 模拟面试', status: 'GENERATING', difficulty: 'MEDIUM', questionCount: 8 } }); const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, interviewId: interview.id, type: TaskType.INTERVIEW_QUESTION_GENERATION, status: TaskStatus.QUEUED } });
    const connection = redisConnection(process.env.REDIS_URL!); const events = new QueueEvents(TASK_QUEUE_NAME, { connection }); await events.waitUntilReady(); const worker = new Worker(TASK_QUEUE_NAME, createTaskHandler(prisma, analysis, cleanup, codeReview, interviewQuestions), { connection }); await worker.waitUntilReady();
    try { const job = await queue.add(TaskType.INTERVIEW_QUESTION_GENERATION, { taskId: task.id }, { jobId: task.id }); await job.waitUntilFinished(events, 15_000); await interviewQuestions.process(task.id); expect(await prisma.interview.findUnique({ where: { id: interview.id } })).toMatchObject({ status: 'READY' }); expect(await prisma.asyncTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: TaskStatus.SUCCEEDED, progress: 100 }); const questions = await prisma.interviewQuestion.findMany({ where: { interviewId: interview.id }, orderBy: { sequence: 'asc' } }); expect(questions).toHaveLength(8); expect(questions.map((value) => value.sequence)).toEqual([1,2,3,4,5,6,7,8]); expect(questions.every((value) => { const metadata = value.referencePoints as { evidencePaths?: string[] }; return metadata.evidencePaths?.every((path) => ['src/main.ts', 'test/main.spec.ts'].includes(path)); })).toBe(true); }
    finally { await worker.close(); await events.close(); }
  });

  it('generates one deterministic interview report and remains idempotent', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Report Worker E2E', originalFileName: 'source.zip', fileSize: 4n, fileHash: '4'.repeat(64), status: ProjectStatus.COMPLETED } });
    const interview = await prisma.interview.create({ data: { userId, projectId: project.id, title: 'Report', status: InterviewStatus.REPORT_GENERATING, difficulty: InterviewDifficulty.MEDIUM, questionCount: 5, submittedAt: new Date(), questions: { create: Array.from({ length: 5 }, (_, index) => ({ sequence: index + 1, category: index % 2 ? 'database' : 'architecture', difficulty: InterviewDifficulty.MEDIUM, question: `How is design ${index + 1} implemented?`, referencePoints: [index % 2 ? 'transaction' : 'JWT'] })) } }, include: { questions: { orderBy: { sequence: 'asc' } } } });
    await prisma.interviewAnswer.createMany({ data: interview.questions.map((question, index) => ({ userId, interviewId: interview.id, questionId: question.id, content: index % 2 ? 'A transaction guarantees consistency' : 'JWT authentication with safe errors' })) });
    const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, interviewId: interview.id, type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.QUEUED } });
    await interviewReports.process(task.id); await interviewReports.process(task.id);
    expect(await prisma.interviewReport.count({ where: { interviewId: interview.id } })).toBe(1);
    expect(await prisma.interview.findUnique({ where: { id: interview.id } })).toMatchObject({ status: InterviewStatus.COMPLETED, completedAt: expect.any(Date) });
    expect(await prisma.asyncTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: TaskStatus.SUCCEEDED, progress: 100 });
    expect(await prisma.interviewReport.findUnique({ where: { interviewId: interview.id } })).toMatchObject({ model: 'deterministic-interview-report-v1', overallScore: expect.any(Number) });
  });

  it('recovers a pending interview report task with taskId-only payload', async () => {
    const project = await prisma.project.create({ data: { userId, name: 'Report Recovery', originalFileName: 'source.zip', fileSize: 4n, fileHash: '5'.repeat(64), status: ProjectStatus.COMPLETED } });
    const interview = await prisma.interview.create({ data: { userId, projectId: project.id, title: 'Recover report', status: InterviewStatus.REPORT_GENERATING, difficulty: InterviewDifficulty.EASY, questionCount: 5 } });
    const task = await prisma.asyncTask.create({ data: { userId, projectId: project.id, interviewId: interview.id, type: TaskType.INTERVIEW_REPORT_GENERATION, status: TaskStatus.PENDING } });
    expect(await new TaskRecoveryService(prisma, queue, 100).recoverBatch()).toBe(1);
    expect(await prisma.asyncTask.findUnique({ where: { id: task.id } })).toMatchObject({ status: TaskStatus.QUEUED, bullJobId: task.id });
    expect((await queue.getJob(task.id))?.data).toEqual({ taskId: task.id });
  });
});
