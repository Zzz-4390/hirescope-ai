import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { TasksService } from './tasks.service';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}
  @Get(':taskId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.tasks.get(user.userId, taskId); }
}
