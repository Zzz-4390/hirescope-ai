import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/bootstrap';
import { ObjectStorageService, type ObjectUpload } from '../src/object-storage/object-storage.service';

class InMemoryObjectStorage extends ObjectStorageService {
  readonly objects = new Map<string, Buffer>();

  async upload(input: ObjectUpload): Promise<void> {
    this.objects.set(input.objectKey, Buffer.from(input.content));
  }

  async delete(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }

  async createSignedReadUrl(objectKey: string): Promise<string> {
    return `https://private-oss.example/${encodeURIComponent(objectKey)}?signed=short-lived`;
  }
}

describe('Auth API', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.TEST_REDIS_URL!);
  const email = 'auth-e2e@example.com';
  const username = 'auth_e2e_user';
  const password = 'StrongPassword123!';
  const origin = 'http://114.55.102.140:3000';
  const loopbackOrigin = 'http://127.0.0.1:4300';
  const objectStorage = new InMemoryObjectStorage();

  function setCookie(response: request.Response): string {
    const header = response.headers['set-cookie'];
    if (!Array.isArray(header) || !header[0]) throw new Error('Expected Set-Cookie header');
    return header[0];
  }

  function sessionId(cookie: string): string {
    const value = cookie.split(';')[0]?.split('=')[1];
    const id = value?.split('.')[0];
    if (!id) throw new Error('Expected refresh session id');
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ObjectStorageService)
      .useValue(objectStorage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@example.com' } } });
    const registerRateLimitKeys = await redis.keys('auth:rate:register:*');
    if (registerRateLimitKeys.length) await redis.del(...registerRateLimitKeys);
    await prisma.$disconnect();
    await redis.quit();
    if (app) await app.close();
  });

  it('validates DTOs before accepting registration', async () => {
    const existingKeys = await redis.keys('auth:rate:register:*');
    if (existingKeys.length) await redis.del(...existingKeys);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      username: 'bad-name', email: 'bad', password: 'short', confirmPassword: 'different',
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(await redis.keys('auth:rate:register:*')).toHaveLength(0);
  });

  it('registers without exposing whether the username or email already exists', async () => {
    const first = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      username: ` ${username.toUpperCase()} `, email: ` ${email.toUpperCase()} `, password, confirmPassword: password,
    });
    const duplicateEmail = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      username: 'another_auth_user', email, password, confirmPassword: password,
    });
    const duplicateUsername = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      username, email: 'another-auth-e2e@example.com', password, confirmPassword: password,
    });
    expect(first.status).toBe(202);
    expect(duplicateEmail.status).toBe(202);
    expect(duplicateUsername.status).toBe(202);
    expect(duplicateEmail.body).toEqual(first.body);
    expect(duplicateUsername.body).toEqual(first.body);
  });

  it('returns identical errors for a wrong password and an unknown identifier', async () => {
    const wrong = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: username, password: 'WrongPassword123!' });
    const missing = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'missing_user', password: 'WrongPassword123!' });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect({ ...wrong.body.error, requestId: undefined }).toEqual({ ...missing.body.error, requestId: undefined });
    expect(wrong.body.error.message).toBe('用户名、邮箱或密码错误');
  });

  it('logs in by username and email, sets an HTTP-compatible cookie, and returns the current user', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: username, password });
    expect(login.status).toBe(200);
    expect(login.body.expiresIn).toBe(900);
    expect(setCookie(login)).toContain('hirescope_refresh=');
    expect(setCookie(login)).toContain('HttpOnly');
    expect(setCookie(login)).not.toContain('Secure');
    expect(setCookie(login)).toContain('SameSite=Lax');
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ username, email, displayName: null });
    expect(me.body.passwordHash).toBeUndefined();
    const emailLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email.toUpperCase(), password });
    expect(emailLogin.status).toBe(200);
    expect(emailLogin.body.user).toMatchObject({ username, email });
  });

  it('uploads the current user avatar and returns a short-lived URL from /auth/me', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    const upload = await request(app.getHttpServer())
      .put('/api/v1/auth/me/avatar')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .field('userId', '00000000-0000-4000-8000-000000000000')
      .attach('file', image, { filename: 'avatar.png', contentType: 'image/png' });

    expect(upload.status).toBe(200);
    expect(upload.body.avatarUrl).toMatch(/^https:\/\/private-oss\.example\/avatars%2F/);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.avatarObjectKey).toMatch(new RegExp(`^avatars/${user.id}/[0-9a-f-]+\\.png$`));
    expect(objectStorage.objects.has(stored.avatarObjectKey!)).toBe(true);

    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.avatarUrl).toContain(encodeURIComponent(stored.avatarObjectKey!));
    expect(me.body.avatarObjectKey).toBeUndefined();
  });

  it('never lets a user select or modify another user avatar', async () => {
    const otherEmail = 'avatar-other@example.com';
    const otherUsername = 'avatar_other_user';
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      username: otherUsername,
      email: otherEmail,
      password,
      confirmPassword: password,
    });
    const other = await prisma.user.findUniqueOrThrow({ where: { email: otherEmail } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    const image = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

    const upload = await request(app.getHttpServer())
      .put('/api/v1/auth/me/avatar')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .field('userId', other.id)
      .attach('file', image, { filename: 'avatar.webp', contentType: 'image/webp' });

    expect(upload.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).avatarObjectKey).toMatch(/^avatars\//);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).avatarObjectKey).toBeNull();
  });

  it('rotates refresh tokens once and leaves the new session valid after stale reuse', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    const oldCookie = setCookie(login).split(';')[0]!;
    const rotated = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', oldCookie);
    expect(rotated.status).toBe(200);
    expect(setCookie(rotated)).toContain('hirescope_refresh=');
    expect(setCookie(rotated)).toContain('HttpOnly');
    expect(setCookie(rotated)).not.toContain('Secure');
    expect(setCookie(rotated)).toContain('SameSite=Lax');
    const newCookie = setCookie(rotated).split(';')[0]!;
    expect(newCookie).not.toBe(oldCookie);
    const replay = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    const next = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', newCookie);
    expect(next.status).toBe(200);
  });

  it('allows only one concurrent refresh', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
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

  it('accepts both configured custom-port loopback origins and rejects untrusted or missing origins', async () => {
    expect((await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('Referer', `${origin}/app`)).status).toBe(204);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Origin', loopbackOrigin)).status).toBe(204);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Origin', 'https://localhost:4301')).status).toBe(403);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/logout')).status).toBe(403);

    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    const cookie = setCookie(login).split(';')[0]!;
    expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', 'https://localhost:3000.evil.test').set('Cookie', cookie)).status).toBe(403);
    const logout = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Referer', `${origin}/account`).set('Cookie', cookie);
    expect(logout.status).toBe(204);
  });

  it('revokes the Redis session, expires the matching cookie, and rejects the old cookie', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    expect(login.status).toBe(200);
    const cookie = setCookie(login).split(';')[0]!;
    const redisKey = `auth:session:v1:${sessionId(cookie)}`;
    expect(await redis.exists(redisKey)).toBe(1);

    const logout = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Origin', origin).set('Cookie', cookie);
    expect(logout.status).toBe(204);
    const clearedCookie = setCookie(logout);
    expect(clearedCookie).toContain('hirescope_refresh=;');
    expect(clearedCookie).toContain('Path=/api/v1/auth');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).not.toContain('Secure');
    expect(clearedCookie).toContain('SameSite=Lax');
    expect(await redis.exists(redisKey)).toBe(0);

    const refresh = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', cookie);
    expect(refresh.status).toBe(401);

    const repeatedLogout = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Origin', origin).set('Cookie', cookie);
    expect(repeatedLogout.status).toBe(204);
    expect(setCookie(repeatedLogout)).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('rate limits a refresh with a missing cookie by IP before rotation', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin);
    expect(response.status).toBe(401);
    expect(await redis.keys('auth:rate:refresh:ip:*')).not.toHaveLength(0);
  });

  it('only grants credentialed CORS to an exact configured public HTTP origin', async () => {
    const allowed = await request(app.getHttpServer()).options('/api/v1/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app.getHttpServer()).options('/api/v1/auth/login').set('Origin', `${origin}.evil.test`).set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('changes the password, revokes every session, and rejects old credentials and refresh tokens', async () => {
    const loginRateLimitKeys = await redis.keys('auth:rate:login:*');
    if (loginRateLimitKeys.length) await redis.del(...loginRateLimitKeys);

    const firstLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    const secondLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password });
    const oldCookie = setCookie(firstLogin).split(';')[0]!;
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect((await redis.keys('auth:session:v1:*')).length).toBeGreaterThanOrEqual(2);

    const changed = await request(app.getHttpServer())
      .post('/api/v1/auth/password')
      .set('Authorization', `Bearer ${secondLogin.body.accessToken}`)
      .set('Cookie', setCookie(secondLogin).split(';')[0]!)
      .send({ currentPassword: password, newPassword: 'NewStrongPassword456!', confirmPassword: 'NewStrongPassword456!' });

    expect(changed.status).toBe(204);
    expect(setCookie(changed)).toContain('hirescope_refresh=;');
    expect(await redis.keys(`auth:user-sessions:v1:${user.id}`)).toHaveLength(0);
    const remainingSessionKeys = await redis.keys('auth:session:v1:*');
    for (const key of remainingSessionKeys) {
      expect(await redis.hget(key, 'userId')).not.toBe(user.id);
    }
    const staleRefresh = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', oldCookie);
    expect(staleRefresh.status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password })).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: email, password: 'NewStrongPassword456!' })).status).toBe(200);
  });

  it('does not expose extra application routes', async () => {
    expect((await request(app.getHttpServer()).get('/')).status).toBe(404);
    expect((await request(app.getHttpServer()).get('/api/v1/auth/unknown')).status).toBe(404);
  });
});
