import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(error: unknown, user: TUser): TUser {
    if (error || !user) throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '认证令牌无效' });
    return user;
  }
}
