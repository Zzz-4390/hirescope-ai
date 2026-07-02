import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation';

const validEnvironment = {
  NODE_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/hirescope_test',
  REDIS_URL: 'redis://localhost:6379/15',
  CORS_ALLOWED_ORIGINS: 'https://localhost:3000', TRUST_PROXY_HOPS: '0',
  JWT_ACCESS_SECRET: 'a'.repeat(32), JWT_ACCESS_TTL_SECONDS: '900',
  JWT_ISSUER: 'hirescope-api', JWT_AUDIENCE: 'hirescope-web',
  AUTH_REFRESH_HASH_SECRET: 'b'.repeat(32), AUTH_REFRESH_TTL_SECONDS: '2592000',
  AUTH_COOKIE_NAME: '__Secure-hirescope_refresh',
  AUTH_DUMMY_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$EEPZnPvCwY5nfeXzD1KhIw$FhWXIFWMOeq3j3hNz5lERJAaD+u4VotBV8upTgifPcE',
  AUTH_ARGON2_MEMORY_KIB: '19456', AUTH_ARGON2_TIME_COST: '2', AUTH_ARGON2_PARALLELISM: '1',
  AUTH_REGISTER_WINDOW_SECONDS: '3600', AUTH_REGISTER_MAX_REQUESTS: '5',
  AUTH_LOGIN_WINDOW_SECONDS: '900', AUTH_LOGIN_MAX_REQUESTS: '10',
  AUTH_REFRESH_WINDOW_SECONDS: '300', AUTH_REFRESH_MAX_REQUESTS: '30',
};

describe('validateEnvironment', () => {
  it('accepts the approved auth configuration', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      API_PORT: 3001,
      JWT_ACCESS_TTL_SECONDS: 900,
      CORS_ALLOWED_ORIGINS: ['https://localhost:3000'],
    });
  });

  it('rejects wildcard or insecure frontend origins', () => {
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: '*' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: 'http://localhost:3000' })).toThrow();
  });

  it('rejects weak or shared token secrets', () => {
    expect(() => validateEnvironment({ ...validEnvironment, JWT_ACCESS_SECRET: 'short' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, AUTH_REFRESH_HASH_SECRET: validEnvironment.JWT_ACCESS_SECRET })).toThrow();
  });
});
