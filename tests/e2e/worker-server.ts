import { createServer } from "node:http";

import { workerConfig } from "../../apps/worker/src/config";
import { startWorkerRuntime } from "../../apps/worker/src/runtime";

const host = "127.0.0.1";
const port = Number(new URL(process.env.PLAYWRIGHT_WORKER_ORIGIN ?? "http://127.0.0.1:4302").port);

async function main() {
  const runtime = await startWorkerRuntime(workerConfig());
  const readinessServer = createServer((_request, response) => {
    response.writeHead(204).end();
  });

  await new Promise<void>((resolve, reject) => {
    readinessServer.once("error", reject);
    readinessServer.listen(port, host, resolve);
  });

  async function close() {
    await new Promise<void>((resolve) => readinessServer.close(() => resolve()));
    await runtime.close();
    process.exit(0);
  }

  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
}

void main().catch(() => {
  console.error("Playwright worker startup failed");
  process.exit(1);
});
