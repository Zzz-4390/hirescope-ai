import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, ProjectStatus, TaskStatus } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { TASK_QUEUE } from '../src/tasks/task-queue.service';

describe('CodeReview API', () => {
  const prisma = new PrismaClient(); let app: INestApplication; let token: string; let otherToken: string; let userId: string; let otherUserId: string; let pendingProjectId: string; let completedProjectId: string; let reviewId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TASK_QUEUE).useValue({ add: async () => undefined }).compile();
    app = moduleRef.createNestApplication(); configureApplication(app); await app.init();
    for (const [username, email] of [['reviews_e2e', 'reviews-e2e@example.com'], ['reviews_other', 'reviews-other@example.com']]) await request(app.getHttpServer()).post('/api/v1/auth/register').send({ username, email, password: 'StrongPassword123!', confirmPassword: 'StrongPassword123!' });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'reviews-e2e@example.com', password: 'StrongPassword123!' }); token = login.body.accessToken;
    const other = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'reviews-other@example.com', password: 'StrongPassword123!' }); otherToken = other.body.accessToken;
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: 'reviews-e2e@example.com' } })).id; otherUserId = (await prisma.user.findUniqueOrThrow({ where: { email: 'reviews-other@example.com' } })).id;
    pendingProjectId = (await createProject(userId, ProjectStatus.ANALYZING, 'Pending')).id; completedProjectId = (await createProject(userId, ProjectStatus.COMPLETED, 'Completed')).id;
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { email: { startsWith: 'reviews-' } } }); await prisma.$disconnect(); await app.close(); });
  async function createProject(owner: string, status: ProjectStatus, name: string) { return prisma.project.create({ data: { userId: owner, name, originalFileName: 'x.zip', fileSize: 4n, fileHash: 'a'.repeat(64), status } }); }

  it('requires authentication', async () => { expect((await request(app.getHttpServer()).post(`/api/v1/projects/${completedProjectId}/code-reviews`)).status).toBe(401); });
  it('hides missing and foreign projects', async () => {
    const foreign = await createProject(otherUserId, ProjectStatus.COMPLETED, 'Foreign');
    expect((await request(app.getHttpServer()).post(`/api/v1/projects/${foreign.id}/code-reviews`).set(auth())).status).toBe(404);
  });
  it('rejects projects that are not COMPLETED', async () => {
    const response = await request(app.getHttpServer()).post(`/api/v1/projects/${pendingProjectId}/code-reviews`).set(auth()); expect(response.status).toBe(409); expect(response.body.error.code).toBe('PROJECT_NOT_READY');
  });
  it('creates one queued review and rejects an active duplicate', async () => {
    const created = await request(app.getHttpServer()).post(`/api/v1/projects/${completedProjectId}/code-reviews`).set(auth()); expect(created.status, JSON.stringify(created.body)).toBe(202); expect(created.body).toMatchObject({ status: 'QUEUED', task: { type: 'CODE_REVIEW', status: 'QUEUED' } }); reviewId = created.body.id;
    const duplicate = await request(app.getHttpServer()).post(`/api/v1/projects/${completedProjectId}/code-reviews`).set(auth()); expect(duplicate.status).toBe(409); expect(duplicate.body.error.code).toBe('TASK_ALREADY_ACTIVE');
    expect(await prisma.codeReview.count({ where: { projectId: completedProjectId } })).toBe(1);
  });
  it('lists review history with pagination and safe fields', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/projects/${completedProjectId}/code-reviews?page=1&pageSize=10`).set(auth()); expect(response.status).toBe(200); expect(response.body.pagination).toMatchObject({ page: 1, pageSize: 10, total: 1 }); expect(response.body.items[0]).toMatchObject({ id: reviewId, status: 'QUEUED', failure: null }); expect(response.body.items[0].failureCode).toBeUndefined();
  });
  it('returns own detail with task and hides it from another user', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/code-reviews/${reviewId}`).set(auth()); expect(response.status).toBe(200); expect(response.body).toMatchObject({ id: reviewId, status: TaskStatus.QUEUED, result: null, task: { status: TaskStatus.QUEUED } });
    expect((await request(app.getHttpServer()).get(`/api/v1/code-reviews/${reviewId}`).set('Authorization', `Bearer ${otherToken}`)).status).toBe(404);
  });
  it('serializes concurrent creation and creates no orphan review', async () => {
    const project = await createProject(userId, ProjectStatus.COMPLETED, 'Concurrent');
    const responses = await Promise.all([request(app.getHttpServer()).post(`/api/v1/projects/${project.id}/code-reviews`).set(auth()), request(app.getHttpServer()).post(`/api/v1/projects/${project.id}/code-reviews`).set(auth())]);
    expect(responses.map((value) => value.status).sort()).toEqual([202, 409]);
    expect(await prisma.codeReview.count({ where: { projectId: project.id } })).toBe(1);
  });
});
