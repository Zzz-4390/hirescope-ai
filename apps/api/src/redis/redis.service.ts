import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = new Redis(process.env.REDIS_URL!, {
    commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 5000),
  });
  pipeline() { return this.client.pipeline(); }
  eval(...args: Parameters<Redis['eval']>): ReturnType<Redis['eval']> { return this.client.eval(...args); }
  async onModuleDestroy(): Promise<void> { await this.client.quit(); }
}
