import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthConfig } from '../../auth/auth.constants';
import { TrustedOriginGuard } from './trusted-origin.guard';

describe('TrustedOriginGuard', () => {
  const allowedOrigins = ['http://114.55.102.140', 'http://localhost:4200', 'http://127.0.0.1:4200'];
  const guard = new TrustedOriginGuard({ allowedOrigins } as AuthConfig);

  it.each(allowedOrigins)('allows an exactly configured origin: %s', (origin) => {
    expect(guard.canActivate(context({ origin }))).toBe(true);
  });

  it('rejects an origin that is not configured', () => {
    expect(() => guard.canActivate(context({ origin: 'http://localhost:4201' }))).toThrow(ForbiddenException);
  });

  it('uses an exact Referer origin when Origin is missing', () => {
    expect(guard.canActivate(context({ referer: 'http://127.0.0.1:4200/account' }))).toBe(true);
  });

  it('rejects requests with neither Origin nor Referer', () => {
    expect(() => guard.canActivate(context({}))).toThrow(ForbiddenException);
  });
});

function context(headers: { origin?: string; referer?: string }): ExecutionContext {
  const normalized = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => normalized.get(name.toLowerCase()) }),
    }),
  } as ExecutionContext;
}
