import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_CONFIG, type AuthConfig } from '../../auth/auth.constants';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.header('Origin');
    let candidate = origin;
    if (!candidate) {
      const referer = request.header('Referer');
      if (referer) {
        try { candidate = new URL(referer).origin; } catch { candidate = undefined; }
      }
    }
    if (!candidate || !this.config.allowedOrigins.includes(candidate)) {
      throw new ForbiddenException({ code: 'INVALID_REQUEST_ORIGIN', message: '请求来源不受信任' });
    }
    return true;
  }
}
