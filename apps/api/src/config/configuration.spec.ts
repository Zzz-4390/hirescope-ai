import { afterEach, describe, expect, it } from 'vitest';
import { authConfiguration } from './configuration';

const originalNodeEnv = process.env.NODE_ENV;
const originalCookieName = process.env.AUTH_COOKIE_NAME;
const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;

afterEach(() => {
  restore('NODE_ENV', originalNodeEnv);
  restore('AUTH_COOKIE_NAME', originalCookieName);
  restore('CORS_ALLOWED_ORIGINS', originalOrigins);
});

describe('authConfiguration', () => {
  it('uses non-secure cookies only in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_COOKIE_NAME = 'hirescope_refresh';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

    expect(authConfiguration()).toMatchObject({
      cookieName: 'hirescope_refresh',
      secureCookies: false,
      allowedOrigins: ['http://localhost:3000'],
    });
  });

  it('keeps cookies secure outside development', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_NAME = '__Secure-hirescope_refresh';
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';

    expect(authConfiguration()).toMatchObject({
      cookieName: '__Secure-hirescope_refresh',
      secureCookies: true,
      allowedOrigins: ['https://app.example.com'],
    });
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
