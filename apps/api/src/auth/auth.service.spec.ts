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
      {} as never,
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
      {} as never,
    );
    const error = await service.refresh('cookie').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('redis connection details');
  });

  it('returns a sanitized 503 when Redis logout is unavailable', async () => {
    const service = new AuthService(
      {} as never,
      {} as never,
      { logout: async () => { throw new Error('redis connection details'); } } as never,
      {} as never,
      {} as never,
    );
    const error = await service.logout('cookie').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('redis connection details');
  });

  it.each([
    ['unsupported type', avatarFile('avatar.gif', 'image/gif', Buffer.from('GIF89a'))],
    ['signature mismatch', avatarFile('avatar.png', 'image/png', Buffer.from([0xff, 0xd8, 0xff, 0x00]))],
  ])('rejects an invalid avatar: %s', async (_name, file) => {
    const service = new AuthService({} as never, {} as never, {} as never, {} as never, {} as never);
    const error = await service.uploadAvatar('user-1', file).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(415);
  });

  it('rejects avatars larger than 5MB', async () => {
    const service = new AuthService({} as never, {} as never, {} as never, {} as never, {} as never);
    const file = avatarFile('avatar.png', 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1));
    const error = await service.uploadAvatar('user-1', file).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(413);
  });

  it('returns a sanitized error when OSS upload fails', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('credential details'));
    const service = new AuthService(
      { findPublicById: vi.fn().mockResolvedValue(publicUser()) } as never,
      {} as never,
      {} as never,
      {} as never,
      { upload } as never,
    );
    const error = await service.uploadAvatar('user-1', validPng()).catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(502);
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('credential details');
  });

  it('deletes the new object when the database update fails', async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      {
        findPublicById: vi.fn().mockResolvedValue(publicUser()),
        updateAvatarObjectKey: vi.fn().mockRejectedValue(new Error('database unavailable')),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      { upload: vi.fn().mockResolvedValue(undefined), delete: deleteObject } as never,
    );

    await expect(service.uploadAvatar('user-1', validPng())).rejects.toThrow('database unavailable');
    expect(deleteObject).toHaveBeenCalledOnce();
    expect(deleteObject.mock.calls[0]?.[0]).toMatch(/^avatars\/user-1\/[0-9a-f-]+\.png$/);
  });

  it('deletes the previous avatar only after the database update succeeds', async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const updateAvatarObjectKey = vi.fn().mockImplementation((_id: string, avatarObjectKey: string) =>
      Promise.resolve(publicUser(avatarObjectKey)));
    const service = new AuthService(
      { findPublicById: vi.fn().mockResolvedValue(publicUser('avatars/user-1/old.webp')), updateAvatarObjectKey } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        upload: vi.fn().mockResolvedValue(undefined),
        delete: deleteObject,
        createSignedReadUrl: vi.fn().mockResolvedValue('https://signed.example/avatar'),
      } as never,
    );

    await expect(service.uploadAvatar('user-1', validPng())).resolves.toMatchObject({
      avatarUrl: 'https://signed.example/avatar',
    });
    expect(updateAvatarObjectKey).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith('avatars/user-1/old.webp');
  });

  it('rejects an incorrect current password without changing sessions', async () => {
    const revokeAll = vi.fn();
    const service = new AuthService(
      { findCredentialsById: vi.fn().mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' }) } as never,
      { verify: vi.fn().mockResolvedValue(false) } as never,
      { revokeAll } as never,
      {} as never,
      {} as never,
    );
    const error = await service.changePassword('user-1', 'wrong-password', 'new-password').catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    expect(revokeAll).not.toHaveBeenCalled();
  });

  it('rejects a new password that matches the current password', async () => {
    const service = new AuthService(
      { findCredentialsById: vi.fn().mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' }) } as never,
      { verify: vi.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const error = await service.changePassword('user-1', 'same-password', 'same-password').catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).getResponse()).toMatchObject({ code: 'PASSWORD_UNCHANGED' });
  });

  it('revokes all sessions before atomically updating the password hash', async () => {
    const revokeAll = vi.fn().mockResolvedValue(undefined);
    const updatePasswordIfCurrentHash = vi.fn().mockResolvedValue({ count: 1 });
    const service = new AuthService(
      { findCredentialsById: vi.fn().mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' }), updatePasswordIfCurrentHash } as never,
      { verify: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false), hash: vi.fn().mockResolvedValue('new-hash') } as never,
      { revokeAll } as never,
      {} as never,
      {} as never,
    );

    await expect(service.changePassword('user-1', 'current-password', 'new-password')).resolves.toBeUndefined();
    expect(revokeAll).toHaveBeenCalledWith('user-1');
    expect(updatePasswordIfCurrentHash).toHaveBeenCalledWith('user-1', 'old-hash', 'new-hash');
    expect(revokeAll.mock.invocationCallOrder[0]).toBeLessThan(updatePasswordIfCurrentHash.mock.invocationCallOrder[0]!);
  });

  it('does not update the password when Redis session revocation fails', async () => {
    const updatePasswordIfCurrentHash = vi.fn();
    const service = new AuthService(
      { findCredentialsById: vi.fn().mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' }), updatePasswordIfCurrentHash } as never,
      { verify: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false), hash: vi.fn().mockResolvedValue('new-hash') } as never,
      { revokeAll: vi.fn().mockRejectedValue(new Error('redis unavailable')) } as never,
      {} as never,
      {} as never,
    );
    const error = await service.changePassword('user-1', 'current-password', 'new-password').catch((caught: unknown) => caught);
    expect((error as HttpException).getStatus()).toBe(503);
    expect(updatePasswordIfCurrentHash).not.toHaveBeenCalled();
    expect(JSON.stringify((error as HttpException).getResponse())).not.toContain('redis unavailable');
  });
});

function publicUser(avatarObjectKey: string | null = null) {
  return {
    id: 'user-1',
    username: 'candidate_01',
    email: 'candidate@example.com',
    displayName: null,
    avatarObjectKey,
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
  };
}

function avatarFile(originalname: string, mimetype: string, buffer: Buffer): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

function validPng(): Express.Multer.File {
  return avatarFile('avatar.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
}
