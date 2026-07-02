import { createHash } from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { RedisLike } from './session.service';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

export class AuthRateLimitService {
  constructor(private readonly redis: RedisLike) {}

  assertRegisterAllowed(ip: string, limit: number, windowSeconds: number): Promise<void> {
    return this.assertAllowed(`auth:rate:register:${ip}`, limit, windowSeconds);
  }

  assertLoginAllowed(ip: string, normalizedEmail: string, limit: number, windowSeconds: number): Promise<void> {
    const emailHash = createHash('sha256').update(normalizedEmail).digest('hex');
    return this.assertAllowed(`auth:rate:login:${ip}:${emailHash}`, limit, windowSeconds);
  }

  assertRefreshAllowed(identifier: string, limit: number, windowSeconds: number): Promise<void> {
    return this.assertAllowed(`auth:rate:refresh:${identifier}`, limit, windowSeconds);
  }

  private async assertAllowed(key: string, limit: number, windowSeconds: number): Promise<void> {
    const result = await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(windowSeconds));
    const values = Array.isArray(result) ? result.map(Number) : [limit + 1, windowSeconds];
    const count = values[0] ?? limit + 1;
    const ttl = values[1] ?? windowSeconds;
    if (count > limit) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: '请求过于频繁', retryAfter: Math.max(ttl, 1) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
