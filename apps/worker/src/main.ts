import { workerConfig } from './config';
import { startWorkerRuntime } from './runtime';

async function main(): Promise<void> {
  const config = workerConfig();
  const runtime = await startWorkerRuntime(config);
  const close = async () => { await runtime.close(); process.exit(0); };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
}

void main().catch(() => { console.error('Worker startup failed'); process.exit(1); });
