import { extractionLimitsFromEnv, TASK_QUEUE_NAME } from '@hirescope/shared-types';
import { resolve } from 'node:path';

export function workerConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required');
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    storageRoot: resolve(env.STORAGE_ROOT ?? 'storage'),
    queueName: env.TASK_QUEUE_NAME ?? TASK_QUEUE_NAME,
    recoveryIntervalMs: positive(env.TASK_RECOVERY_INTERVAL_MS, 30_000),
    recoveryBatchSize: positive(env.TASK_RECOVERY_BATCH_SIZE, 100),
    limits: extractionLimitsFromEnv(env),
  };
}

function positive(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Worker numeric configuration must be positive integers');
  return value;
}
