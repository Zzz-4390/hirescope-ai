import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, ProjectStatus, TaskStatus, TaskType } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { TASK_QUEUE } from '../src/tasks/task-queue.service';

describe('Projects and AsyncTasks API without a worker', () => {
  let app: INestApplication;
  let failedQueueApp: INestApplication;
  const prisma = new PrismaClient();
  const email = 'projects-e2e@example.com';
  const username = 'projects_e2e';
  const password = 'StrongPassword123!';
  let token: string;
  let userId: string;
  let projectId: string;
  let analysisTaskId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({ username, email, password, confirmPassword: password });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    token = login.body.accessToken;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: 'projects-' } } });
    await prisma.$disconnect();
    if (failedQueueApp) await failedQueueApp.close();
    if (app) await app.close();
  });

  it('rejects unauthenticated and invalid ZIP uploads', async () => {
    expect((await request(app.getHttpServer()).post('/api/v1/projects')).status).toBe(401);
    const invalid = await request(app.getHttpServer()).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).field('name', 'Bad').attach('file', Buffer.from('bad'), { filename: 'bad.zip', contentType: 'application/zip' });
    expect(invalid.status, JSON.stringify(invalid.body)).toBe(422);
    expect(invalid.body.error.code).toBe('INVALID_ZIP_FILE');
  });

  it('rejects ZIP payloads over 50MB at the multipart layer', async () => {
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1);
    oversized.set([0x50, 0x4b, 0x03, 0x04]);
    const response = await request(app.getHttpServer()).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).field('name', 'Too Large').attach('file', oversized, { filename: 'large.zip', contentType: 'application/zip' });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(await prisma.project.count({ where: { userId, name: 'Too Large' } })).toBe(0);
  });

  it('removes a disk-backed temporary upload when DTO validation fails', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).field('name', '').attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]), { filename: 'invalid-dto.zip', contentType: 'application/zip' });
    expect(response.status).toBe(422);
    const temporaryFiles = await readdir(join(process.env.STORAGE_ROOT!, 'tmp')).catch(() => []);
    expect(temporaryFiles.filter((name) => name.endsWith('.upload'))).toHaveLength(0);
  });

  it('uploads to disk, queues analysis, and remains QUEUED without a worker', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).field('name', 'Demo Project').field('description', 'Example').attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), { filename: 'demo.ZIP', contentType: 'application/zip' });
    expect(response.status, JSON.stringify(response.body)).toBe(202);
    expect(response.body.project.status).toBe('QUEUED');
    expect(response.body.task.status).toBe('QUEUED');
    expect(response.body.project.zipStoragePath).toBeUndefined();
    expect(response.body.project.fileHash).toBeUndefined();
    projectId = response.body.project.id;
    analysisTaskId = response.body.task.id;
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(stored.status).toBe(ProjectStatus.QUEUED);
    expect((await prisma.asyncTask.findUniqueOrThrow({ where: { id: analysisTaskId } })).status).toBe(TaskStatus.QUEUED);
  });

  it('returns fixed pagination, detail, task, and analysis-not-ready responses', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/projects?page=1&pageSize=20&keyword=Demo').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.pagination).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(list.body.items[0].fileHash).toBeUndefined();
    const detail = await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.zipStoragePath).toBeUndefined();
    const task = await request(app.getHttpServer()).get(`/api/v1/tasks/${analysisTaskId}`).set('Authorization', `Bearer ${token}`);
    expect(task.status).toBe(200);
    expect(task.body).toMatchObject({ id: analysisTaskId, type: 'PROJECT_ANALYSIS', status: 'QUEUED', progress: 0, failure: null });
    const analysis = await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}/analysis`).set('Authorization', `Bearer ${token}`);
    expect(analysis.status).toBe(409);
    expect(analysis.body.error.code).toBe('PROJECT_ANALYSIS_NOT_READY');
  });

  it('returns 404 for another user resources', async () => {
    const other = await prisma.user.create({ data: { username: 'projects_other', email: 'projects-other@example.com', passwordHash: 'not-used' } });
    const foreign = await prisma.project.create({ data: { userId: other.id, name: 'Foreign', originalFileName: 'x.zip', fileSize: 4n, fileHash: 'a'.repeat(64), status: ProjectStatus.UPLOADED } });
    expect((await request(app.getHttpServer()).get(`/api/v1/projects/${foreign.id}`).set('Authorization', `Bearer ${token}`)).status).toBe(404);
  });

  it('queues cleanup, remains DELETING, and prevents duplicate deletion', async () => {
    const removed = await request(app.getHttpServer()).delete(`/api/v1/projects/${projectId}`).set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(202);
    expect(removed.body).toMatchObject({ type: 'PROJECT_CLEANUP', status: 'QUEUED' });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe(ProjectStatus.DELETING);
    expect((await request(app.getHttpServer()).delete(`/api/v1/projects/${projectId}`).set('Authorization', `Bearer ${token}`)).body.error.code).toBe('TASK_ALREADY_ACTIVE');
  });

  it('preserves UPLOADED/PENDING and returns 503 when BullMQ publishing fails', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TASK_QUEUE).useValue({ add: async () => { throw new Error('queue unavailable'); } }).compile();
    failedQueueApp = moduleRef.createNestApplication();
    configureApplication(failedQueueApp);
    await failedQueueApp.init();
    const response = await request(failedQueueApp.getHttpServer()).post('/api/v1/projects').set('Authorization', `Bearer ${token}`).field('name', 'Queue Failure').attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04, 9]), { filename: 'failure.zip', contentType: 'application/x-zip-compressed' });
    expect(response.status).toBe(503);
    const project = await prisma.project.findFirstOrThrow({ where: { userId, name: 'Queue Failure' } });
    const task = await prisma.asyncTask.findFirstOrThrow({ where: { projectId: project.id, type: TaskType.PROJECT_ANALYSIS } });
    expect(project.status).toBe(ProjectStatus.UPLOADED);
    expect(task.status).toBe(TaskStatus.PENDING);
  });
});
