import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? randomUUID();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = '服务器内部错误';
    let retryAfter: number | undefined;
    let validationErrors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const details = body as Record<string, unknown>;
        code = typeof details.code === 'string' ? details.code : status === 422 ? 'VALIDATION_FAILED' : 'REQUEST_FAILED';
        message = typeof details.message === 'string' ? details.message : status === 422 ? '请求参数校验失败' : message;
        retryAfter = typeof details.retryAfter === 'number' ? details.retryAfter : undefined;
        validationErrors = Array.isArray(details.validationErrors) ? details.validationErrors : undefined;
      }
      if (status === HttpStatus.PAYLOAD_TOO_LARGE && code === 'REQUEST_FAILED') {
        code = 'PAYLOAD_TOO_LARGE';
        message = '上传文件不能超过 50MB';
      }
    }
    if (process.env.NODE_ENV === 'development' && validationErrors) {
      this.logger.warn(JSON.stringify({ requestId, validationErrors }));
    }
    if (retryAfter) response.setHeader('Retry-After', String(retryAfter));
    response.status(status).json({ error: { code, message, requestId } });
  }
}
