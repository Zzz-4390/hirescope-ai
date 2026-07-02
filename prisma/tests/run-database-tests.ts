import { spawnSync } from 'node:child_process';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required');
}

const parsedUrl = new URL(testDatabaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, '');
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

if (!localHosts.has(parsedUrl.hostname) || !databaseName.endsWith('_test')) {
  throw new Error('Refusing to reset a non-local or non-test database');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Database integration tests cannot run in production');
}

const command = 'pnpm';
const testTarget = process.argv[2] ?? 'prisma/tests';
const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
};

function run(args: string[]): void {
  const result = spawnSync(command, args, {
    env: environment,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['prisma', 'migrate', 'reset', '--force']);
run(['vitest', 'run', testTarget]);
