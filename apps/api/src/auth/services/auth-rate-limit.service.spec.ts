import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthRateLimitService } from './auth-rate-limit.service';

class FakeRedis {
  calls: unknown[][] = [];
  result: [number, number] = [1, 60];
  async eval(...args: unknown[]) { this.calls.push(args); return this.result; }
}

describe('AuthRateLimitService', () => {
  it('does not put normalized email in the Redis login key', async () => {
    const redis = new FakeRedis();
    const service = new AuthRateLimitService(redis as never);
    await service.assertLoginAllowed('127.0.0.1', 'user@example.com', 10, 900);
    expect(JSON.stringify(redis.calls)).not.toContain('user@example.com');
  });

  it('rejects requests over the limit with retry information', async () => {
    const redis = new FakeRedis();
    redis.result = [11, 120];
    const service = new AuthRateLimitService(redis as never);
    const error = await service.assertLoginAllowed('127.0.0.1', 'user@example.com', 10, 900)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });
});
