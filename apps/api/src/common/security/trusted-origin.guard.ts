import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_CONFIG, type AuthConfig } from '../../auth/auth.constants';
import { isAllowedOrigin, resolveRequestOrigin } from './trusted-origin';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const candidate = resolveRequestOrigin(request.header('Origin'), request.header('Referer'));
    if (!isAllowedOrigin(candidate, this.config.allowedOrigins)) {
      throw new ForbiddenException({ code: 'INVALID_REQUEST_ORIGIN', message: '请求来源不受信任' });
    }
    return true;
  }
}
