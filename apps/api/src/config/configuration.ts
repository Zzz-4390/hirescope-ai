import type { AuthConfig } from '../auth/auth.constants';

const number = (name: string): number => Number(process.env[name]);

export function authConfiguration(): AuthConfig {
  return {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS!.split(',').map((value) => value.trim()),
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    accessTtlSeconds: number('JWT_ACCESS_TTL_SECONDS'),
    issuer: process.env.JWT_ISSUER!,
    audience: process.env.JWT_AUDIENCE!,
    refreshHashSecret: process.env.AUTH_REFRESH_HASH_SECRET!,
    refreshTtlSeconds: number('AUTH_REFRESH_TTL_SECONDS'),
    cookieName: process.env.AUTH_COOKIE_NAME!,
    secureCookies: process.env.NODE_ENV !== 'development',
    dummyPasswordHash: process.env.AUTH_DUMMY_PASSWORD_HASH!,
    argon2: {
      memoryCost: number('AUTH_ARGON2_MEMORY_KIB'),
      timeCost: number('AUTH_ARGON2_TIME_COST'),
      parallelism: number('AUTH_ARGON2_PARALLELISM'),
    },
    rateLimits: {
      register: { limit: number('AUTH_REGISTER_MAX_REQUESTS'), windowSeconds: number('AUTH_REGISTER_WINDOW_SECONDS') },
      login: { limit: number('AUTH_LOGIN_MAX_REQUESTS'), windowSeconds: number('AUTH_LOGIN_WINDOW_SECONDS') },
      refresh: { limit: number('AUTH_REFRESH_MAX_REQUESTS'), windowSeconds: number('AUTH_REFRESH_WINDOW_SECONDS') },
    },
  };
}
