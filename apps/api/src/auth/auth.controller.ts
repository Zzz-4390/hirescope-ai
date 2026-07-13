import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TrustedOriginGuard } from '../common/security/trusted-origin.guard';
import { DtoValidationPipe } from '../common/validation/dto-validation.pipe';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, AUTH_RATE_LIMIT_SERVICE, SESSION_SERVICE, type AuthConfig } from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthRateLimitService } from './services/auth-rate-limit.service';
import type { SessionService } from './services/session.service';
import type { AuthenticatedUser } from './types/authenticated-user';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_RATE_LIMIT_SERVICE) private readonly rateLimits: AuthRateLimitService,
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body(new DtoValidationPipe(RegisterDto)) dto: RegisterDto, @Req() request: Request) {
    const limit = this.config.rateLimits.register;
    await this.rateLimits.assertRegisterAllowed(this.ip(request), limit.limit, limit.windowSeconds);
    return this.auth.register(dto.username, dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new DtoValidationPipe(LoginDto)) dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const limit = this.config.rateLimits.login;
    await this.rateLimits.assertLoginAllowed(this.ip(request), dto.identifier, limit.limit, limit.windowSeconds);
    const result = await this.auth.login(dto.identifier, dto.password);
    this.setRefreshCookie(response, result.cookieValue);
    const { cookieValue: _cookie, ...body } = result;
    return body;
  }

  @Post('refresh')
  @UseGuards(TrustedOriginGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cookie = request.cookies?.[this.config.cookieName] as string | undefined;
    const parsed = this.sessions.parseCookie(cookie);
    const identifier = parsed?.sessionId ?? `ip:${this.ip(request)}`;
    const limit = this.config.rateLimits.refresh;
    await this.rateLimits.assertRefreshAllowed(identifier, limit.limit, limit.windowSeconds);
    const result = await this.auth.refresh(cookie ?? '');
    this.setRefreshCookie(response, result.cookieValue);
    const { cookieValue: _cookie, ...body } = result;
    return body;
  }

  @Post('logout')
  @UseGuards(TrustedOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(request.cookies?.[this.config.cookieName]);
    response.clearCookie(this.config.cookieName, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.userId);
  }

  private setRefreshCookie(response: Response, value: string): void {
    response.cookie(this.config.cookieName, value, {
      ...this.cookieOptions(), maxAge: this.config.refreshTtlSeconds * 1000,
    });
  }

  private cookieOptions() {
    return { httpOnly: true, secure: this.config.secureCookies, sameSite: 'lax' as const, path: '/api/v1/auth' };
  }

  private ip(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
