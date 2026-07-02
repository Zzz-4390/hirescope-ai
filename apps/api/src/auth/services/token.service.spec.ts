import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service';

describe('TokenService', () => {
  it('issues a 900 second access token with required claims', async () => {
    const service = new TokenService(new JwtService(), {
      secret: 'a'.repeat(32), issuer: 'hirescope-api', audience: 'hirescope-web', ttlSeconds: 900,
    });
    const token = await service.issueAccessToken('user-id', 'session-id');
    const payload = new JwtService().decode(token) as Record<string, unknown>;

    expect(payload).toMatchObject({ sub: 'user-id', sid: 'session-id', typ: 'access', iss: 'hirescope-api', aud: 'hirescope-web' });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(900);
    expect(payload.jti).toEqual(expect.any(String));
  });
});
