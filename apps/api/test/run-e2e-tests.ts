import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL are required');

const database = new URL(databaseUrl);
const redis = new URL(redisUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || decodeURIComponent(database.pathname.slice(1)) !== 'hirescope_test') {
  throw new Error('TEST_DATABASE_URL must target the local hirescope_test database');
}
if (!['localhost', '127.0.0.1', '::1'].includes(redis.hostname) || redis.pathname !== '/15') {
  throw new Error('TEST_REDIS_URL must target local Redis DB 15');
}

const root = resolve(__dirname, '../../..');
const requiredRedisUrl = redisUrl;
const environment = { ...process.env, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl };
const command = 'pnpm';
function run(args: string[]): void {
  const result = spawnSync(command, args, { cwd: root, env: environment, shell: process.platform === 'win32', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main(): Promise<void> {
  run(['prisma', 'migrate', 'reset', '--force']);
  run(['--filter', '@hirescope/api', 'exec', 'prisma', 'generate', '--schema', '../../prisma/schema.prisma']);
  const redisClient = new Redis(requiredRedisUrl, { lazyConnect: true });
  await redisClient.connect();
  await redisClient.flushdb();
  await redisClient.quit();
  run(['exec', 'vitest', 'run', 'apps/api/test']);
}

void main();
