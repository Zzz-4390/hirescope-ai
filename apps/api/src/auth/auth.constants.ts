export const AUTH_CONFIG = 'AUTH_CONFIG';
export const PASSWORD_SERVICE = 'PASSWORD_SERVICE';
export const TOKEN_SERVICE = 'TOKEN_SERVICE';
export const SESSION_SERVICE = 'SESSION_SERVICE';
export const AUTH_RATE_LIMIT_SERVICE = 'AUTH_RATE_LIMIT_SERVICE';

export interface AuthConfig {
  allowedOrigins: string[];
  accessSecret: string;
  accessTtlSeconds: number;
  issuer: string;
  audience: string;
  refreshHashSecret: string;
  refreshTtlSeconds: number;
  cookieName: string;
  dummyPasswordHash: string;
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
  rateLimits: {
    register: { limit: number; windowSeconds: number };
    login: { limit: number; windowSeconds: number };
    refresh: { limit: number; windowSeconds: number };
  };
}
