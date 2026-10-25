import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiResultImportService, formatAiResultValidationError } from '../ai-results/ai-result-import.service';
import { makeAiResult } from '../../test/fixtures/ai-result.fixture';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { AiJobWorkerService } from './ai-job-worker.service';

function makeSchema12Payload() {
  const payload = makeAiResult();
  payload.schema_version = '1.2';
  payload.summary.schema_version = '1.2';
  payload.events[0].schema_version = '1.2';
  Object.assign(payload.events[0], { plate_crop_path: null, plate_crop_reason: 'NOT_A_REASON' });
  return payload;
}

describe('AI result validation failure diagnostics', () => {
  it('adds the invalid field path and constraint to the worker errorMessage and ERROR log', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-worker-validation-unit-'));
    try {
      await mkdir(join(root, 'videos'));
      await writeFile(join(root, 'videos/input.mp4'), 'test video');

      const processingJob = { updateMany: jest.fn(() => Promise.resolve({ count: 1 })) };
      const prisma = {
        video: { findUnique: jest.fn(() => Promise.resolve({ storageKey: 'videos/input.mp4' })) },
        processingJob,
      } as unknown as PrismaService;
      const storage = { root } as unknown as LocalStorageService;
      const importer = new AiResultImportService(prisma, storage);
      const settings: Record<string, string> = {
        AI_PYTHON_BIN: process.execPath,
        AI_SERVICE_ROOT: root,
        AI_JOB_TIMEOUT_MS: '1000',
        AI_WORKER_POLL_INTERVAL_MS: '50',
        AI_WORKER_CONCURRENCY: '1',
        AI_KEEP_FAILED_WORKDIR: 'false',
      };
      const config = { get: (key: string) => settings[key] } as unknown as ConfigService;
      const worker = new AiJobWorkerService(prisma, importer, storage, config);
      Object.defineProperty(worker, 'runPython', {
        configurable: true,
        value: async (_job: unknown, _inputPath: unknown, outputDir: string) => {
          await writeFile(join(outputDir, 'results.json'), JSON.stringify(makeSchema12Payload()));
          return { code: 0, signal: null, stderr: '', timedOut: false, cancelled: false };
        },
      });
      const logger = Reflect.get(worker, 'logger') as Logger;
      const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
      const processClaimed = Reflect.get(worker, 'processClaimed') as (job: { id: string; videoId: string }) => Promise<void>;
      const job = { id: 'job-validation-123', videoId: 'video-validation-123' };

      await processClaimed.call(worker, job);

      const updateCalls = (processingJob.updateMany as unknown as {
        mock: { calls: Array<[{ where: { id: string; status: string }; data: { status: string; errorMessage: string } }]> };
      }).mock.calls;
      const update = updateCalls[0]?.[0];
      expect(update).toBeDefined();
      if (!update) throw new Error('Worker should mark the job FAILED');
      expect(update.where).toEqual({ id: job.id, status: 'PROCESSING' });
      expect(update.data.status).toBe('FAILED');
      expect(update.data.errorMessage).toContain('AI result JSON không hợp lệ');
      expect(update.data.errorMessage).toContain('events.0.plate_crop_reason:');
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(`AI job ${job.id} failed: ${update.data.errorMessage}`));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports unsupported schema and unknown field details from class-validator', async () => {
    const prisma = {} as PrismaService;
    const importer = new AiResultImportService(prisma, {} as LocalStorageService);

    const unsupported = makeAiResult();
    unsupported.schema_version = '2.0';
    unsupported.summary.schema_version = '2.0';
    unsupported.events[0].schema_version = '2.0';
    await expect(importer.import('job-id', unsupported, '/tmp/results'))
      .rejects.toThrow('schema_version: schema_version must be one of the following values: 1.0, 1.1, 1.2');

    const unknown = makeSchema12Payload();
    Object.assign(unknown.events[0], { forged: true });
    await expect(importer.import('job-id', unknown, '/tmp/results'))
      .rejects.toThrow('events.0.forged: property forged should not exist');

    const manyUnknown = makeAiResult();
    manyUnknown.schema_version = '1.2';
    manyUnknown.summary.schema_version = '1.2';
    manyUnknown.events[0].schema_version = '1.2';
    Object.assign(manyUnknown.events[0], {
      plate_crop_path: null,
      plate_crop_reason: 'TOO_SMALL',
      forged_one: true,
      forged_two: true,
      forged_three: true,
      forged_four: true,
    });
    let manyErrorMessage = '';
    try {
      await importer.import('job-id', manyUnknown, '/tmp/results');
    } catch (error) {
      manyErrorMessage = error instanceof Error ? error.message : String(error);
    }
    expect(manyErrorMessage.match(/events\.0\./g)).toHaveLength(3);
    expect(manyErrorMessage).not.toContain('forged_four');
  });

  it('limits diagnostic length to 500 characters and redacts absolute user paths', () => {
    expect(formatAiResultValidationError(new BadRequestException('Không hỗ trợ AI schema 2.0')))
      .toBe('AI result JSON không hợp lệ: Không hỗ trợ AI schema 2.0');
    const error = new BadRequestException(`${'validation detail '.repeat(80)} /Users/test-user/private/results.json /home/test-user/secret.json`);
    const message = formatAiResultValidationError(error);

    expect(message.startsWith('AI result JSON không hợp lệ')).toBe(true);
    expect(message.length).toBeLessThanOrEqual(500);
    expect(message).not.toContain('/Users');
    expect(message).not.toContain('/home');
  });
});
