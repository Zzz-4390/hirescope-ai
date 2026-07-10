import { extractionLimitsFromEnv, TASK_QUEUE_NAME } from '@hirescope/shared-types';
import { resolve } from 'node:path';
import type { OpenAiCompatibleProviderConfig } from './ai/openai-compatible.provider';

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
    ai: aiConfig(env),
  };
}

function aiConfig(env: NodeJS.ProcessEnv): OpenAiCompatibleProviderConfig | undefined {
  const baseUrl = env.AI_BASE_URL?.trim();
  const apiKey = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (!baseUrl && !apiKey && !model) return undefined;
  if (!baseUrl || !apiKey || !model) throw new Error('AI_BASE_URL, AI_API_KEY and AI_MODEL must be configured together');
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('AI_BASE_URL must be a valid HTTP(S) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('AI_BASE_URL must be a valid HTTP(S) URL');
  if (model.length > 100) throw new Error('AI_MODEL must be at most 100 characters');
  return { baseUrl: url.toString().replace(/\/$/, ''), apiKey, model };
}

function positive(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Worker numeric configuration must be positive integers');
  return value;
}
