import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TasksService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(userId: string, taskId: string) {
    const task = await this.prisma.asyncTask.findFirst({
      where: { id: taskId, userId },
      select: { id: true, type: true, status: true, progress: true, failureCode: true, failureMessage: true, createdAt: true, completedAt: true },
    });
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: '任务不存在' });
    const { failureCode, failureMessage, ...response } = task;
    return { ...response, failure: failureCode ? { code: failureCode, message: failureMessage } : null };
  }
}
