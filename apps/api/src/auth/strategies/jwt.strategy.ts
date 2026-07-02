import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_CONFIG, type AuthConfig } from '../auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.accessSecret,
      issuer: config.issuer,
      audience: config.audience,
    });
  }

  validate(payload: Record<string, unknown>) {
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '认证令牌无效' });
    }
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
