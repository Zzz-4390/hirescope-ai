import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import Redis from "ioredis";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error("TEST_DATABASE_URL and TEST_REDIS_URL are required");

const database = new URL(databaseUrl);
const redis = new URL(redisUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname) || !database.pathname.slice(1).endsWith("_test")) {
  throw new Error("Playwright E2E requires a local *_test database");
}
if (!["localhost", "127.0.0.1", "::1"].includes(redis.hostname) || redis.pathname !== "/15") {
  throw new Error("Playwright E2E requires local Redis DB 15");
}

const root = resolve(__dirname, "../..");
const storageRoot = resolve(root, "storage/playwright-e2e");
const { AI_BASE_URL: _baseUrl, AI_API_KEY: _apiKey, AI_MODEL: _model, ...baseEnvironment } = process.env;
const environment: NodeJS.ProcessEnv = {
  ...baseEnvironment,
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  STORAGE_ROOT: storageRoot,
  TASK_QUEUE_NAME: "hirescope-playwright-e2e",
  API_HOST: "127.0.0.1",
  API_PORT: "4301",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4300",
  TRUST_PROXY_HOPS: "0",
  JWT_ACCESS_SECRET: "playwright-access-secret-at-least-32-bytes",
  JWT_ACCESS_TTL_SECONDS: "900",
  JWT_ISSUER: "hirescope-api",
  JWT_AUDIENCE: "hirescope-web",
  AUTH_REFRESH_HASH_SECRET: "playwright-refresh-secret-at-least-32-bytes",
  AUTH_REFRESH_TTL_SECONDS: "2592000",
  AUTH_COOKIE_SECURE: "false",
  AUTH_COOKIE_NAME: "hirescope_e2e_refresh",
  AUTH_DUMMY_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$EEPZnPvCwY5nfeXzD1KhIw$FhWXIFWMOeq3j3hNz5lERJAaD+u4VotBV8upTgifPcE",
  AUTH_ARGON2_MEMORY_KIB: "19456",
  AUTH_ARGON2_TIME_COST: "2",
  AUTH_ARGON2_PARALLELISM: "1",
  AUTH_REGISTER_WINDOW_SECONDS: "3600",
  AUTH_REGISTER_MAX_REQUESTS: "20",
  AUTH_LOGIN_WINDOW_SECONDS: "900",
  AUTH_LOGIN_MAX_REQUESTS: "30",
  AUTH_REFRESH_WINDOW_SECONDS: "300",
  AUTH_REFRESH_MAX_REQUESTS: "60",
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:4300",
  PLAYWRIGHT_API_ORIGIN: "http://127.0.0.1:4301",
  PLAYWRIGHT_WORKER_ORIGIN: "http://127.0.0.1:4302",
};

function run(args: string[]) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    env: environment,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with exit code ${result.status ?? 1}: pnpm ${args.join(" ")}`);
}

async function flushRedis() {
  const client = new Redis(redisUrl, { lazyConnect: true });
  await client.connect();
  await client.flushdb();
  await client.quit();
}

async function cleanup() {
  await flushRedis().catch(() => undefined);
  rmSync(storageRoot, { recursive: true, force: true });
}

async function main() {
  rmSync(storageRoot, { recursive: true, force: true });
  run(["prisma", "migrate", "reset", "--force"]);
  run(["prisma", "generate"]);
  run(["--filter", "@hirescope/shared-types", "build"]);
  await flushRedis();

  const passthrough = process.argv.slice(2);
  try {
    run(["exec", "playwright", "test", ...passthrough]);
  } finally {
    await cleanup();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
