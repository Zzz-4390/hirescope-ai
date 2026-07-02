import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TrustedOriginGuard } from '../common/security/trusted-origin.guard';
import { RedisService } from '../redis/redis.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AUTH_CONFIG, AUTH_RATE_LIMIT_SERVICE, PASSWORD_SERVICE, SESSION_SERVICE, TOKEN_SERVICE } from './auth.constants';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthRateLimitService } from './services/auth-rate-limit.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { authConfiguration } from '../config/configuration';

@Module({
  imports: [UsersModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtService,
    JwtStrategy,
    JwtAuthGuard,
    TrustedOriginGuard,
    { provide: AUTH_CONFIG, useFactory: authConfiguration },
    {
      provide: PASSWORD_SERVICE,
      inject: [AUTH_CONFIG],
      useFactory: (config: ReturnType<typeof authConfiguration>) =>
        new PasswordService({ ...config.argon2, dummyHash: config.dummyPasswordHash }),
    },
    {
      provide: SESSION_SERVICE,
      inject: [RedisService, AUTH_CONFIG],
      useFactory: (redis: RedisService, config: ReturnType<typeof authConfiguration>) =>
        new SessionService(redis, { hashSecret: config.refreshHashSecret, ttlSeconds: config.refreshTtlSeconds, keyPrefix: 'auth:session:v1:' }),
    },
    {
      provide: TOKEN_SERVICE,
      inject: [JwtService, AUTH_CONFIG],
      useFactory: (jwt: JwtService, config: ReturnType<typeof authConfiguration>) =>
        new TokenService(jwt, { secret: config.accessSecret, issuer: config.issuer, audience: config.audience, ttlSeconds: config.accessTtlSeconds }),
    },
    {
      provide: AUTH_RATE_LIMIT_SERVICE,
      inject: [RedisService],
      useFactory: (redis: RedisService) => new AuthRateLimitService(redis),
    },
  ],
})
export class AuthModule {}
