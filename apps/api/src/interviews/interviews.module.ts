import { Module } from '@nestjs/common'; import { TasksModule } from '../tasks/tasks.module'; import { InterviewsController } from './interviews.controller'; import { InterviewsService } from './interviews.service';
@Module({ imports: [TasksModule], controllers: [InterviewsController], providers: [InterviewsService] }) export class InterviewsModule {}
