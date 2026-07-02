import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';

describe('Auth API', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.TEST_REDIS_URL!);
  const email = 'auth-e2e@example.com';
  const password = 'StrongPassword123!';
  const origin = 'https://localhost:3000';

  function setCookie(response: request.Response): string {
    const header = response.headers['set-cookie'];
    if (!Array.isArray(header) || !header[0]) throw new Error('Expected Set-Cookie header');
    return header[0];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
    await prisma.$disconnect();
    await redis.quit();
    if (app) await app.close();
  });

  it('validates DTOs before accepting registration', async () => {
    const existingKeys = await redis.keys('auth:rate:register:*');
    if (existingKeys.length) await redis.del(...existingKeys);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'bad', password: 'short' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(await redis.keys('auth:rate:register:*')).toHaveLength(0);
  });

  it('registers without exposing whether the email already exists', async () => {
    const first = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: ` ${email.toUpperCase()} `, password, displayName: ' User ' });
    const second = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body).toEqual(first.body);
  });

  it('returns identical errors for a wrong password and an unknown email', async () => {
    const wrong = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'WrongPassword123!' });
    const missing = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'missing@example.com', password: 'WrongPassword123!' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect({ ...wrong.body.error, requestId: undefined }).toEqual({ ...missing.body.error, requestId: undefined });
  });

  it('logs in, sets a secure cookie, and returns the current user', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.expiresIn).toBe(900);
    expect(setCookie(login)).toContain('__Secure-hirescope_refresh=');
    expect(setCookie(login)).toContain('HttpOnly');
    expect(setCookie(login)).toContain('Secure');
    expect(setCookie(login)).toContain('SameSite=Lax');
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email, displayName: 'User' });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('rotates refresh tokens once and leaves the new session valid after stale reuse', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    const oldCookie = setCookie(login).split(';')[0]!;
    const rotated = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', oldCookie);
    expect(rotated.status).toBe(200);
    const newCookie = setCookie(rotated).split(';')[0]!;
    expect(newCookie).not.toBe(oldCookie);
    const replay = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    const next = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', newCookie);
    expect(next.status).toBe(200);
  });

  it('allows only one concurrent refresh', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    const cookie = setCookie(login).split(';')[0]!;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', cookie),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', cookie),
    ]);
    expect(responses.map((item) => item.status).sort()).toEqual([200, 401]);
    const winner = responses.find((item) => item.status === 200)!;
    const nextCookie = setCookie(winner).split(';')[0]!;
    const next = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', nextCookie);
    expect(next.status).toBe(200);
  });

  it('requires a trusted Origin or Referer for refresh and logout', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    const cookie = setCookie(login).split(';')[0]!;
    expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', 'https://localhost:3000.evil.test').set('Cookie', cookie)).status).toBe(403);
    const logout = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Referer', `${origin}/account`).set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(setCookie(logout)).toContain('Expires=Thu, 01 Jan 1970');
    expect(setCookie(logout)).toContain('Secure');
  });

  it('rate limits a refresh with a missing cookie by IP before rotation', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin);
    expect(response.status).toBe(401);
    expect(await redis.keys('auth:rate:refresh:ip:*')).not.toHaveLength(0);
  });

  it('only grants CORS to an exact configured HTTPS origin', async () => {
    const allowed = await request(app.getHttpServer()).options('/api/v1/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app.getHttpServer()).options('/api/v1/auth/login').set('Origin', `${origin}.evil.test`).set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not expose extra application routes', async () => {
    expect((await request(app.getHttpServer()).get('/')).status).toBe(404);
    expect((await request(app.getHttpServer()).get('/api/v1/auth/unknown')).status).toBe(404);
  });
});
