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
  AUTH_COOKIE_SECURE: 'true', AUTH_COOKIE_NAME: '__Secure-hirescope_refresh',
  AUTH_DUMMY_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$EEPZnPvCwY5nfeXzD1KhIw$FhWXIFWMOeq3j3hNz5lERJAaD+u4VotBV8upTgifPcE',
  AUTH_ARGON2_MEMORY_KIB: '19456', AUTH_ARGON2_TIME_COST: '2', AUTH_ARGON2_PARALLELISM: '1',
  AUTH_REGISTER_WINDOW_SECONDS: '3600', AUTH_REGISTER_MAX_REQUESTS: '5',
  AUTH_LOGIN_WINDOW_SECONDS: '900', AUTH_LOGIN_MAX_REQUESTS: '10',
  AUTH_REFRESH_WINDOW_SECONDS: '300', AUTH_REFRESH_MAX_REQUESTS: '30',
  OSS_ACCESS_KEY_ID: 'replace_with_oss_access_key_id',
  OSS_ACCESS_KEY_SECRET: 'replace_with_oss_access_key_secret',
  OSS_BUCKET: 'replace-with-private-bucket', OSS_REGION: 'oss-cn-hangzhou',
  OSS_SIGNED_URL_TTL_SECONDS: '900',
};

describe('validateEnvironment', () => {
  it('accepts the approved auth configuration', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      API_PORT: 3001,
      REDIS_COMMAND_TIMEOUT_MS: 5000,
      JWT_ACCESS_TTL_SECONDS: 900,
      AUTH_COOKIE_SECURE: true,
      CORS_ALLOWED_ORIGINS: ['https://localhost:3000'],
      OSS_SIGNED_URL_TTL_SECONDS: 900,
    });
  });

  it('rejects wildcard and malformed frontend origins', () => {
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: '*' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: 'ftp://app.example.com' })).toThrow();
  });

  it('accepts an explicit public HTTP origin and normal cookie name in production', () => {
    expect(validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'http://114.55.102.140',
      AUTH_COOKIE_SECURE: 'false',
      AUTH_COOKIE_NAME: 'hirescope_refresh',
    })).toMatchObject({
      AUTH_COOKIE_SECURE: false,
      CORS_ALLOWED_ORIGINS: ['http://114.55.102.140'],
    });
  });

  it('rejects invalid or internally inconsistent cookie security settings', () => {
    expect(() => validateEnvironment({
      ...validEnvironment,
      AUTH_COOKIE_SECURE: 'yes',
    })).toThrow('AUTH_COOKIE_SECURE must be true or false');
    expect(() => validateEnvironment({
      ...validEnvironment,
      CORS_ALLOWED_ORIGINS: 'http://114.55.102.140:3000',
    })).toThrow('AUTH_COOKIE_SECURE must be false');
    expect(() => validateEnvironment({
      ...validEnvironment,
      CORS_ALLOWED_ORIGINS: 'http://114.55.102.140:3000',
      AUTH_COOKIE_SECURE: 'false',
      AUTH_COOKIE_NAME: '__Secure-hirescope_refresh',
    })).toThrow('AUTH_COOKIE_NAME must not use the __Secure- prefix');
  });

  it('rejects non-origin URL forms and empty allowlist entries', () => {
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: 'https://app.example.com/' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: 'https://app.example.com/path' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, CORS_ALLOWED_ORIGINS: 'https://app.example.com,' })).toThrow();
  });

  it('rejects weak or shared token secrets', () => {
    expect(() => validateEnvironment({ ...validEnvironment, JWT_ACCESS_SECRET: 'short' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, AUTH_REFRESH_HASH_SECRET: validEnvironment.JWT_ACCESS_SECRET })).toThrow();
  });

  it('validates the Redis command timeout', () => {
    expect(validateEnvironment({ ...validEnvironment, REDIS_COMMAND_TIMEOUT_MS: '2500' })).toMatchObject({
      REDIS_COMMAND_TIMEOUT_MS: 2500,
    });
    expect(() => validateEnvironment({ ...validEnvironment, REDIS_COMMAND_TIMEOUT_MS: '0' })).toThrow();
  });

  it('validates private OSS connection settings and signed URL lifetime', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      OSS_BUCKET: 'replace-with-private-bucket',
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_SIGNED_URL_TTL_SECONDS: 900,
    });
    expect(() => validateEnvironment({ ...validEnvironment, OSS_REGION: 'cn-hangzhou' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, OSS_BUCKET: 'Invalid_Bucket' })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, OSS_SIGNED_URL_TTL_SECONDS: '3601' })).toThrow();
  });
});
