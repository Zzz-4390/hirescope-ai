import { MiddlewareConsumer, Module, NestModule, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'], validate: validateEnvironment }),
    PrismaModule,
    RedisModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      provide: APP_PIPE,
      useFactory: () => new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: '请求参数校验失败' }),
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(RequestIdMiddleware).forRoutes('*'); }
}
