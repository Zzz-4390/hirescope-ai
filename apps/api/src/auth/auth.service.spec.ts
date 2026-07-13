import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('normalizes and registers a username and email', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'user-1' });
    const hash = vi.fn().mockResolvedValue('argon2id-hash');
    const service = new AuthService(
      { create } as never,
      { hash } as never,
      {} as never,
      {} as never,
    );

    await expect(service.register(' Candidate_01 ', ' USER@Example.COM ', 'secret123')).resolves.toEqual({ accepted: true });
    expect(hash).toHaveBeenCalledWith('secret123');
    expect(create).toHaveBeenCalledWith('candidate_01', 'user@example.com', 'argon2id-hash');
  });

  it('logs in with a normalized identifier and returns the username', async () => {
    const findByIdentifier = vi.fn().mockResolvedValue({
      id: 'user-1', username: 'candidate_01', email: 'candidate@example.com', passwordHash: 'hash', displayName: null,
    });
    const service = new AuthService(
      { findByIdentifier } as never,
      { verify: vi.fn().mockResolvedValue(true) } as never,
      { create: vi.fn().mockResolvedValue({ sessionId: 'session-1', cookieValue: 'cookie' }) } as never,
      { issueAccessToken: vi.fn().mockResolvedValue('access-token') } as never,
    );

    const result = await service.login(' Candidate_01 ', 'secret123');

    expect(findByIdentifier).toHaveBeenCalledWith('candidate_01');
    expect(result.user).toMatchObject({ username: 'candidate_01', email: 'candidate@example.com' });
  });

  it('returns the same error for an unknown identifier without exposing account existence', async () => {
    const verifyDummy = vi.fn().mockResolvedValue(false);
    const service = new AuthService(
      { findByIdentifier: vi.fn().mockResolvedValue(null) } as never,
      { verifyDummy } as never,
      {} as never,
      {} as never,
    );

    const error = await service.login('missing_user', 'wrong-password').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(401);
    expect((error as HttpException).getResponse()).toMatchObject({ message: '用户名、邮箱或密码错误' });
    expect(verifyDummy).toHaveBeenCalledWith('wrong-password');
  });

  it('returns a sanitized 503 when Redis rotation is unavailable', async () => {
    const service = new AuthService(
      {} as never,
      {} as never,
      { rotate: async () => { throw new Error('redis connection details'); } } as never,
      {} as never,
    );
    const error = await service.refresh('cookie').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('redis connection details');
  });
});
