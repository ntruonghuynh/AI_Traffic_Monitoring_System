import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { AppModule } from '../app.module';
import { AiResultImportService } from './ai-result-import.service';

interface CliOptions {
  jobId: string;
  file: string;
  resultRoot: string;
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('Cú pháp: --job-id <UUID> --file <results.json> --result-root <dir>');
    values.set(key, value);
  }
  const jobId = values.get('--job-id');
  const file = values.get('--file');
  const resultRoot = values.get('--result-root');
  if (!jobId || !file || !resultRoot) throw new Error('Thiếu --job-id, --file hoặc --result-root');
  return { jobId, file, resultRoot };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rootReal = await realpath(resolve(options.resultRoot));
  const fileReal = await realpath(resolve(options.file));
  const relation = relative(rootReal, fileReal);
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error('--file phải nằm bên trong --result-root');
  }
  const payload: unknown = JSON.parse(await readFile(fileReal, 'utf8'));
  const application = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const result = await application.get(AiResultImportService).import(options.jobId, payload, rootReal);
    process.stdout.write(`${JSON.stringify({ jobId: result.id, status: result.status, events: result._count.events })}\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'AI import failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
