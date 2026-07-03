import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { CodeReviewsController } from './code-reviews.controller';
import { CodeReviewsService } from './code-reviews.service';

@Module({ imports: [TasksModule], controllers: [CodeReviewsController], providers: [CodeReviewsService] })
export class CodeReviewsModule {}
