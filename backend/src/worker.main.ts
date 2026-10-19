import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AiJobWorkerService } from './worker/ai-job-worker.service';
import { WorkerModule } from './worker/worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  const worker = app.get(AiJobWorkerService);
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await worker.stop();
    await app.close();
  };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
  await worker.start();
  await app.close();
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
