import { createHmac, randomBytes, randomUUID } from 'node:crypto';

interface RedisPipelineLike {
  hset(...args: unknown[]): RedisPipelineLike;
  expire(...args: unknown[]): RedisPipelineLike;
  exec(): Promise<unknown>;
}

export interface RedisLike {
  pipeline(): RedisPipelineLike;
  eval(...args: unknown[]): Promise<unknown>;
}

export interface SessionOptions {
  hashSecret: string;
  ttlSeconds: number;
  keyPrefix: string;
}

export interface SessionToken {
  sessionId: string;
  userId: string;
  cookieValue: string;
}

const ROTATE_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'refreshTokenHash')
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
local userId = redis.call('HGET', KEYS[1], 'userId')
redis.call('HSET', KEYS[1], 'refreshTokenHash', ARGV[2], 'expiresAt', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return userId
`;

const LOGOUT_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'refreshTokenHash')
if not current or current ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export class SessionService {
  constructor(private readonly redis: RedisLike, private readonly options: SessionOptions) {}

  async create(userId: string): Promise<SessionToken> {
    const sessionId = randomUUID();
    const verifier = randomBytes(32).toString('base64url');
    const now = Date.now();
    const key = this.key(sessionId);
    await this.redis.pipeline()
      .hset(
        key,
        'userId', userId,
        'refreshTokenHash', this.hashVerifier(verifier),
        'createdAt', new Date(now).toISOString(),
        'expiresAt', new Date(now + this.options.ttlSeconds * 1000).toISOString(),
      )
      .expire(key, this.options.ttlSeconds)
      .exec();
    return { sessionId, userId, cookieValue: `${sessionId}.${verifier}` };
  }

  async rotate(cookieValue: string): Promise<SessionToken | null> {
    const parsed = this.parseCookie(cookieValue);
    if (!parsed) return null;
    const nextVerifier = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.options.ttlSeconds * 1000).toISOString();
    const result = await this.redis.eval(
      ROTATE_SCRIPT,
      1,
      this.key(parsed.sessionId),
      this.hashVerifier(parsed.verifier),
      this.hashVerifier(nextVerifier),
      expiresAt,
      String(this.options.ttlSeconds),
    );
    if (typeof result !== 'string' || result.length === 0) return null;
    return { sessionId: parsed.sessionId, userId: result, cookieValue: `${parsed.sessionId}.${nextVerifier}` };
  }

  async logout(cookieValue: string): Promise<void> {
    const parsed = this.parseCookie(cookieValue);
    if (!parsed) return;
    await this.redis.eval(LOGOUT_SCRIPT, 1, this.key(parsed.sessionId), this.hashVerifier(parsed.verifier));
  }

  parseCookie(cookieValue: string | undefined): { sessionId: string; verifier: string } | null {
    if (!cookieValue) return null;
    const match = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(cookieValue);
    return match ? { sessionId: match[1]!, verifier: match[2]! } : null;
  }

  private hashVerifier(verifier: string): string {
    return createHmac('sha256', this.options.hashSecret).update(verifier).digest('hex');
  }

  private key(sessionId: string): string {
    return `${this.options.keyPrefix}${sessionId}`;
  }
}
