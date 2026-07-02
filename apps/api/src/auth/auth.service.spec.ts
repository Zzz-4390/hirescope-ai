import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService refresh failures', () => {
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
