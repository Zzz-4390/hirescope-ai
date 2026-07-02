import { describe, expect, it } from 'vitest';
import { SessionService } from './session.service';

class FakeRedis {
  evalResults: unknown[] = [];
  evalCalls: unknown[][] = [];
  pipelineCommands: unknown[][] = [];

  pipeline() {
    return {
      hset: (...args: unknown[]) => { this.pipelineCommands.push(['hset', ...args]); return this.pipeline(); },
      expire: (...args: unknown[]) => { this.pipelineCommands.push(['expire', ...args]); return this.pipeline(); },
      exec: async () => [],
    };
  }

  async eval(...args: unknown[]) {
    this.evalCalls.push(args);
    return this.evalResults.shift();
  }
}

describe('SessionService', () => {
  const options = { hashSecret: 'b'.repeat(32), ttlSeconds: 2592000, keyPrefix: 'auth:session:v1:' };

  it('creates an opaque session cookie and stores only its hash', async () => {
    const redis = new FakeRedis();
    const service = new SessionService(redis as never, options);
    const session = await service.create('user-id');

    expect(session.cookieValue).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const stored = JSON.stringify(redis.pipelineCommands);
    expect(stored).toContain('refreshTokenHash');
    expect(stored).not.toContain(session.cookieValue.split('.')[1]);
  });

  it('does not delete the current session when an old token comparison fails', async () => {
    const redis = new FakeRedis();
    redis.evalResults.push(-1);
    const service = new SessionService(redis as never, options);
    const result = await service.rotate(`00000000-0000-4000-8000-000000000000.${'a'.repeat(43)}`);

    expect(result).toBeNull();
    expect(JSON.stringify(redis.evalCalls)).not.toContain('DEL');
  });

  it('rejects malformed cookies before calling Redis', async () => {
    const redis = new FakeRedis();
    const service = new SessionService(redis as never, options);
    await expect(service.rotate('malformed')).resolves.toBeNull();
    expect(redis.evalCalls).toHaveLength(0);
  });
});
