import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { RequestIdMiddleware } from './common/http/request-id.middleware';
import { createGlobalValidationPipe } from './common/validation/global-validation.pipe';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CodeReviewsModule } from './code-reviews/code-reviews.module';
import { InterviewsModule } from './interviews/interviews.module';
import { VersionController } from './version/version.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'], validate: validateEnvironment }),
    PrismaModule,
    RedisModule,
    AuthModule,
    TasksModule,
    ProjectsModule,
    CodeReviewsModule,
    InterviewsModule,
  ],
  controllers: [VersionController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    {
      provide: APP_PIPE,
      useFactory: createGlobalValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(RequestIdMiddleware).forRoutes('*'); }
}
