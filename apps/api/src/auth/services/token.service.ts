import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';

export interface AccessTokenOptions {
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

export class TokenService {
  constructor(private readonly jwt: JwtService, private readonly options: AccessTokenOptions) {}

  issueAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sid: sessionId, jti: randomUUID(), typ: 'access' },
      {
        secret: this.options.secret,
        subject: userId,
        issuer: this.options.issuer,
        audience: this.options.audience,
        expiresIn: this.options.ttlSeconds,
      },
    );
  }
}
