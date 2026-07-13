import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PASSWORD_SERVICE, SESSION_SERVICE, TOKEN_SERVICE } from './auth.constants';
import type { PasswordService } from './services/password.service';
import type { SessionService } from './services/session.service';
import type { TokenService } from './services/token.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async register(username: string, email: string, password: string): Promise<{ accepted: true }> {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    try {
      await this.users.create(normalizedUsername, normalizedEmail, passwordHash);
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') throw error;
    }
    return { accepted: true };
  }

  async login(identifier: string, password: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const user = await this.users.findByIdentifier(normalizedIdentifier);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.passwords.verifyDummy(password);
    if (!user || !valid) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: '用户名、邮箱或密码错误' });

    try {
      const session = await this.sessions.create(user.id);
      const accessToken = await this.tokens.issueAccessToken(user.id, session.sessionId);
      return {
        accessToken,
        expiresIn: 900,
        cookieValue: session.cookieValue,
        user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName },
      };
    } catch {
      throw new ServiceUnavailableException({ code: 'AUTH_SESSION_UNAVAILABLE', message: '认证服务暂时不可用' });
    }
  }

  async refresh(cookieValue: string) {
    let session;
    try {
      session = await this.sessions.rotate(cookieValue);
    } catch {
      throw new ServiceUnavailableException({ code: 'AUTH_SESSION_UNAVAILABLE', message: '认证服务暂时不可用' });
    }
    if (!session) throw new UnauthorizedException({ code: 'AUTH_INVALID_SESSION', message: '会话无效或已过期' });
    const accessToken = await this.tokens.issueAccessToken(session.userId, session.sessionId);
    return { accessToken, expiresIn: 900, cookieValue: session.cookieValue };
  }

  logout(cookieValue: string | undefined): Promise<void> {
    return cookieValue ? this.sessions.logout(cookieValue) : Promise.resolve();
  }

  async me(userId: string) {
    const user = await this.users.findPublicById(userId);
    if (!user) throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '认证令牌无效' });
    return user;
  }
}
