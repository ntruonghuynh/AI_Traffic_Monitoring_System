import { TestingModule, Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  EvidenceAssetType,
  PrismaClient,
  ProcessingJobStatus,
} from '../src/generated/prisma/client';
import { AiResultImportService } from '../src/ai-results/ai-result-import.service';
import { makeAiResult } from './fixtures/ai-result.fixture';
import { PrismaService } from '../src/prisma/prisma.service';
import { LocalStorageService } from '../src/storage/local-storage.service';
import { AiJobWorkerService } from '../src/worker/ai-job-worker.service';

const testUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testUrl);
const fakePythonSource = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const output = arg('--output');
const jobId = arg('--job-id');
const observedEnv = Object.fromEntries(['TRAFFIC_AI_VEHICLE_MODEL_PATH', 'TRAFFIC_AI_PLATE_MODEL_PATH', 'DATABASE_URL', 'TEST_DATABASE_URL'].map((key) => [key, Object.hasOwn(process.env, key) ? process.env[key] : null]));
fs.writeFileSync(path.join(output, 'child-env.json'), JSON.stringify(observedEnv));
if (process.env.FAKE_AI_CAPTURE_PATH) fs.copyFileSync(path.join(output, 'child-env.json'), process.env.FAKE_AI_CAPTURE_PATH);
if (process.env.FAKE_AI_MARKER) fs.appendFileSync(process.env.FAKE_AI_MARKER, jobId + '\n');
if (process.env.FAKE_AI_CHILD_MARKER) {
  const child = spawn(process.execPath, ['-e', "const fs=require('fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),40)", process.env.FAKE_AI_CHILD_MARKER], { stdio: 'ignore' });
  fs.writeFileSync(process.env.FAKE_AI_CHILD_PID, String(child.pid));
}
if (process.env.FAKE_AI_DELAY_MS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_AI_DELAY_MS));
const payload = JSON.parse(fs.readFileSync(process.env.FAKE_AI_PAYLOAD_FILE, 'utf8'));
if (process.env.FAKE_AI_STATUS) payload.summary.status = process.env.FAKE_AI_STATUS;
if (payload.summary.status === 'FAILED' && !payload.summary.error) payload.summary.error = 'fake Python failure';
fs.mkdirSync(path.join(output, 'evidence'), { recursive: true });
if (process.env.FAKE_AI_WRITE_EVIDENCE !== 'false') fs.copyFileSync(process.env.FAKE_AI_JPEG_FILE, path.join(output, 'evidence/event.jpg'));
if (process.env.FAKE_AI_MISSING_EVIDENCE === 'true') payload.events[0].evidence_path = 'evidence/missing.jpg';
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(payload));
process.exit(Number(process.env.FAKE_AI_EXIT_CODE || 0));
`;
const smallJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebm5qio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebm5qio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebm5qio6Slpqeoqaqys7S09TV1tfY2drh4uPk5ebm5qio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z',
  'base64',
);

(runIntegration ? describe : describe.skip)('AI job worker PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let moduleRef: TestingModule;
  let worker: AiJobWorkerService;
  let storageRoot: string;
  let testRoot: string;
  let fakePython: string;
  let jpegPath: string;
  let envCapturePath: string;
  let payloadPath: string;
  let videoId: string | undefined;
  let jobId: string | undefined;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    if (!testUrl) return;
    const parsedUrl = new URL(testUrl);
    const databaseName = parsedUrl.pathname.slice(1);
    if (!databaseName.endsWith('_test')) throw new Error('TEST_DATABASE_URL phải trỏ tới database có hậu tố _test');
    const allowedPorts = process.env.CI === 'true' ? ['5432', '5433'] : ['5433'];
    if (
      databaseName !== 'traffic_monitoring_test'
      || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)
      || !allowedPorts.includes(parsedUrl.port)
    ) {
      throw new Error(`Integration test chỉ được dùng traffic_monitoring_test trên localhost (cổng ${allowedPorts.join(' hoặc ')})`);
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
    await prisma.$connect();
    storageRoot = await mkdtemp(join(tmpdir(), 'ai-worker-storage-'));
    testRoot = await mkdtemp(join(tmpdir(), 'ai-worker-test-'));
    fakePython = join(testRoot, 'fake-python');
    payloadPath = join(testRoot, 'result.json');
    jpegPath = join(testRoot, 'evidence.jpg');
    envCapturePath = join(testRoot, 'child-env.json');
    await writeFile(fakePython, fakePythonSource);
    await writeFile(jpegPath, smallJpeg);
    await chmod(fakePython, 0o755);
    for (const key of ['FAKE_AI_PAYLOAD_FILE', 'FAKE_AI_JPEG_FILE', 'FAKE_AI_CAPTURE_PATH', 'FAKE_AI_MARKER', 'FAKE_AI_CHILD_MARKER', 'FAKE_AI_CHILD_PID', 'FAKE_AI_DELAY_MS', 'FAKE_AI_STATUS', 'FAKE_AI_EXIT_CODE', 'FAKE_AI_WRITE_EVIDENCE', 'FAKE_AI_MISSING_EVIDENCE', 'FAKE_AI_NO_JSON', 'TRAFFIC_AI_VEHICLE_MODEL_PATH', 'TRAFFIC_AI_PLATE_MODEL_PATH', 'DATABASE_URL', 'TEST_DATABASE_URL']) {
      originalEnv[key] = process.env[key];
    }
    process.env.FAKE_AI_PAYLOAD_FILE = payloadPath;
    process.env.FAKE_AI_JPEG_FILE = jpegPath;
    const values: Record<string, string> = {
      AI_PYTHON_BIN: fakePython,
      AI_SERVICE_ROOT: testRoot,
      AI_JOB_TIMEOUT_MS: '1500',
      AI_WORKER_POLL_INTERVAL_MS: '50',
      AI_WORKER_CONCURRENCY: '1',
      AI_KEEP_FAILED_WORKDIR: 'false',
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        AiJobWorkerService,
        AiResultImportService,
        LocalStorageService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => values[key],
            getOrThrow: (key: string) => key === 'STORAGE_ROOT' ? storageRoot : values[key],
          },
        },
      ],
    }).compile();
    worker = moduleRef.get(AiJobWorkerService);
  });

  beforeEach(async () => {
    if (!prisma) return;
    await writeFile(fakePython, fakePythonSource);
    await chmod(fakePython, 0o755);
    for (const key of ['FAKE_AI_CAPTURE_PATH', 'FAKE_AI_MARKER', 'FAKE_AI_CHILD_MARKER', 'FAKE_AI_CHILD_PID', 'FAKE_AI_DELAY_MS', 'FAKE_AI_STATUS', 'FAKE_AI_EXIT_CODE', 'FAKE_AI_WRITE_EVIDENCE', 'FAKE_AI_MISSING_EVIDENCE', 'FAKE_AI_NO_JSON', 'TRAFFIC_AI_VEHICLE_MODEL_PATH', 'TRAFFIC_AI_PLATE_MODEL_PATH', 'DATABASE_URL', 'TEST_DATABASE_URL']) delete process.env[key];
    const video = await prisma.video.create({
      data: { originalFilename: 'input_video.mp4', storageKey: `videos/${randomUUID()}.mp4`, mimeType: 'video/mp4', fileSize: 1n },
    });
    videoId = video.id;
    await mkdir(join(storageRoot, 'videos'), { recursive: true });
    await writeFile(join(storageRoot, video.storageKey), Buffer.from('fake video input'));
    const job = await prisma.processingJob.create({ data: { videoId: video.id, status: ProcessingJobStatus.PENDING } });
    jobId = job.id;
    const payload = makeAiResult({
      summary: { ...makeAiResult().summary, job_id: job.id },
      events: [{ ...makeAiResult().events[0], event_id: randomUUID() }],
    });
    await writeFile(payloadPath, JSON.stringify(payload));
  });

  afterEach(async () => {
    if (prisma && jobId) await prisma.processingJob.deleteMany({ where: { id: jobId } });
    if (prisma && videoId) await prisma.video.deleteMany({ where: { id: videoId } });
    jobId = undefined;
    videoId = undefined;
    if (process.env.FAKE_AI_MARKER) await rm(process.env.FAKE_AI_MARKER, { force: true });
    if (process.env.FAKE_AI_CHILD_MARKER) await rm(process.env.FAKE_AI_CHILD_MARKER, { force: true });
    if (process.env.FAKE_AI_CHILD_PID) await rm(process.env.FAKE_AI_CHILD_PID, { force: true });
    if (envCapturePath) await rm(envCapturePath, { force: true });
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma?.$disconnect();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
  });

  it('runs fake Python, imports event and evidence, and completes the job', async () => {
    await expect(worker.claimAndRunOne()).resolves.toBe(true);
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.COMPLETED);
    expect(await prisma.detectionEvent.count({ where: { jobId: jobId! } })).toBe(1);
    const event = await prisma.detectionEvent.findFirstOrThrow({ where: { jobId: jobId! } });
    const assets = await prisma.evidenceAsset.findMany({ where: { eventId: event.id } });
    expect(assets).toHaveLength(1);
    expect(assets[0]?.assetType).toBe(EvidenceAssetType.IMAGE);
    await expect(readFile(join(storageRoot, assets[0].storageKey))).resolves.toEqual(smallJpeg);
  });

  it('passes model paths to Python but omits database URLs from its environment', async () => {
    const modelEnv = {
      TRAFFIC_AI_VEHICLE_MODEL_PATH: '/fake/absolute/models/vehicle.pt',
      TRAFFIC_AI_PLATE_MODEL_PATH: '/fake/absolute/models/plate.pt',
      DATABASE_URL: 'postgresql://test-only:secret@127.0.0.1:5433/should_not_be_inherited',
      TEST_DATABASE_URL: 'postgresql://test-only:secret@127.0.0.1:5433/traffic_monitoring_test',
    };
    const previous = Object.fromEntries(Object.keys(modelEnv).map((key) => [key, process.env[key]]));
    process.env.FAKE_AI_CAPTURE_PATH = envCapturePath;
    Object.assign(process.env, modelEnv);
    try {
      await expect(worker.claimAndRunOne()).resolves.toBe(true);
      const observed = JSON.parse(await readFile(envCapturePath, 'utf8')) as Record<string, string | null>;
      expect(observed).toEqual({
        TRAFFIC_AI_VEHICLE_MODEL_PATH: modelEnv.TRAFFIC_AI_VEHICLE_MODEL_PATH,
        TRAFFIC_AI_PLATE_MODEL_PATH: modelEnv.TRAFFIC_AI_PLATE_MODEL_PATH,
        DATABASE_URL: null,
        TEST_DATABASE_URL: null,
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      delete process.env.FAKE_AI_CAPTURE_PATH;
    }
  });

  it('imports a Python exit 1 FAILED summary and persists its error', async () => {
    process.env.FAKE_AI_EXIT_CODE = '1';
    process.env.FAKE_AI_STATUS = 'FAILED';
    const payload = JSON.parse(await readFile(payloadPath, 'utf8')) as { summary: { status: string; error: string | null } };
    payload.summary.status = 'FAILED';
    payload.summary.error = 'simulated Python failure';
    await writeFile(payloadPath, JSON.stringify(payload));
    await worker.claimAndRunOne();
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toBe('simulated Python failure');
    expect(job.completedAt).not.toBeNull();
  });

  it('marks exit 2 without results JSON as FAILED', async () => {
    process.env.FAKE_AI_EXIT_CODE = '2';
    process.env.FAKE_AI_WRITE_EVIDENCE = 'false';
    const source = fakePythonSource.replace("fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(payload));", "if (process.env.FAKE_AI_NO_JSON !== 'true') fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(payload));");
    await writeFile(fakePython, source);
    await chmod(fakePython, 0o755);
    process.env.FAKE_AI_NO_JSON = 'true';
    await worker.claimAndRunOne();
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toContain('results.json');
    expect(job.errorMessage?.length).toBeLessThanOrEqual(1_000);
  });

  it('times out and kills the Python process group', async () => {
    process.env.FAKE_AI_DELAY_MS = '5000';
    const marker = join(testRoot, `child-${randomUUID()}.txt`);
    const pidFile = join(testRoot, `child-${randomUUID()}.pid`);
    process.env.FAKE_AI_CHILD_MARKER = marker;
    process.env.FAKE_AI_CHILD_PID = pidFile;
    await worker.claimAndRunOne();
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toContain('timeout');
    const before = (await readFile(marker, 'utf8').catch(() => '')).length;
    await new Promise((done) => setTimeout(done, 200));
    const after = (await readFile(marker, 'utf8').catch(() => '')).length;
    expect(after).toBe(before);
  });

  it('atomically claims a pending job when two workers compete', async () => {
    const marker = join(testRoot, `claims-${randomUUID()}.txt`);
    process.env.FAKE_AI_MARKER = marker;
    const [first, second] = await Promise.all([worker.claimAndRunOne(), worker.claimAndRunOne()]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((await readFile(marker, 'utf8')).trim().split('\n')).toHaveLength(1);
    expect((await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } })).status).toBe(ProcessingJobStatus.COMPLETED);
  });

  it('recovers an overdue PROCESSING job as FAILED', async () => {
    await prisma.processingJob.update({
      where: { id: jobId! },
      data: { status: ProcessingJobStatus.PROCESSING, startedAt: new Date(Date.now() - 60_000) },
    });
    await expect(worker.recoverStaleJobs()).resolves.toBe(1);
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.completedAt).not.toBeNull();
  });

  it('marks the claimed job FAILED when the importer rejects Python output', async () => {
    process.env.FAKE_AI_MISSING_EVIDENCE = 'true';
    process.env.FAKE_AI_WRITE_EVIDENCE = 'false';
    await worker.claimAndRunOne();
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toBeTruthy();
    expect(job.completedAt).not.toBeNull();
    expect(await prisma.detectionEvent.count({ where: { jobId: jobId! } })).toBe(0);
  });

  it('does not claim a FAILED job or change it to COMPLETED', async () => {
    await prisma.processingJob.update({ where: { id: jobId! }, data: { status: ProcessingJobStatus.FAILED } });
    await expect(worker.claimAndRunOne()).resolves.toBe(false);
    expect((await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } })).status).toBe(ProcessingJobStatus.FAILED);
  });

  it('stops claiming and marks the active job FAILED on graceful shutdown', async () => {
    process.env.FAKE_AI_DELAY_MS = '5000';
    const marker = join(testRoot, `shutdown-${randomUUID()}.txt`);
    process.env.FAKE_AI_MARKER = marker;
    const loop = worker.start();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await readFile(marker, 'utf8').catch(() => '')) break;
      await new Promise((done) => setTimeout(done, 20));
    }
    expect(await readFile(marker, 'utf8').catch(() => '')).toContain(jobId);
    await worker.stop();
    await loop;
    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId! } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toContain('shutdown');
    expect(job.completedAt).not.toBeNull();
  });
});
