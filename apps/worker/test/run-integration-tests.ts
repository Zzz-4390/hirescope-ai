import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error('TEST_DATABASE_URL and TEST_REDIS_URL are required');
const database = new URL(databaseUrl);
const redis = new URL(redisUrl);
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || database.pathname.slice(1) !== 'hirescope_test') throw new Error('Worker integration tests require local hirescope_test');
if (!['localhost', '127.0.0.1', '::1'].includes(redis.hostname) || redis.pathname !== '/15') throw new Error('Worker integration tests require local Redis DB 15');
const root = resolve(__dirname, '../../..');
const storageRoot = resolve(root, 'storage/worker-integration');
rmSync(storageRoot, { recursive: true, force: true });
const environment = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, STORAGE_ROOT: storageRoot };
function run(args: string[]) {
  const result = spawnSync('pnpm', args, { cwd: root, env: environment, shell: process.platform === 'win32', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
async function main() {
  run(['prisma', 'migrate', 'reset', '--force']);
  run(['--filter', '@hirescope/worker', 'exec', 'prisma', 'generate', '--schema', '../../prisma/schema.prisma']);
  const client = new Redis(redisUrl, { lazyConnect: true });
  await client.connect(); await client.flushdb(); await client.quit();
  run(['exec', 'vitest', 'run', 'apps/worker/test', '--maxWorkers=1']);
}
void main();
