import { Logger, UnprocessableEntityException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('logs validationErrors with requestId in development while keeping the response sanitized', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { host, response } = httpHost('request-123');
    const validationErrors = [{ property: 'content', constraints: { minLength: 'content must be longer than or equal to 1 characters' } }];

    new HttpExceptionFilter().catch(new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: '请求参数校验失败', validationErrors }), host);

    expect(warn).toHaveBeenCalledWith(JSON.stringify({ requestId: 'request-123', validationErrors }));
    expect(response.json).toHaveBeenCalledWith({ error: { code: 'VALIDATION_FAILED', message: '请求参数校验失败', requestId: 'request-123' } });
  });

  it('does not log validation details in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { host, response } = httpHost('request-456');

    new HttpExceptionFilter().catch(new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: '请求参数校验失败', validationErrors: [{ property: 'questionId' }] }), host);

    expect(warn).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ error: { code: 'VALIDATION_FAILED', message: '请求参数校验失败', requestId: 'request-456' } });
  });
});

function httpHost(requestId: string) {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}
