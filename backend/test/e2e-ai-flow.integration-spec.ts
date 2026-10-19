import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaClient, ProcessingJobStatus, ReviewStatus } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiResultImportService } from '../src/ai-results/ai-result-import.service';
import { AiJobWorkerService } from '../src/worker/ai-job-worker.service';
import { makeAiResult } from './fixtures/ai-result.fixture';
import { assertSafeTestDatabaseUrl, runIntegration, testDatabaseUrl } from './helpers/test-database';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { AiProcessingResultDto } from '../src/ai-results/dto/ai-result.dto';

const fakePythonSource = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
const output = argument('--output');
const plan = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fake-plan.json'), 'utf8'));
if (plan.parentPid) fs.writeFileSync(plan.parentPid, String(process.pid));
if (plan.childMarker) {
  const childCode = "const fs=require('fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),40)";
  const child = spawn(process.execPath, ['-e', childCode, plan.childMarker], { stdio: 'ignore' });
  fs.writeFileSync(plan.childPid, String(child.pid));
}
if (plan.delayMs) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, plan.delayMs);
const payload = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fake-result.json'), 'utf8'));
if (plan.status) payload.summary.status = plan.status;
if (plan.error !== undefined) payload.summary.error = plan.error;
if (plan.noEvidence) payload.events[0].evidence_path = null;
if (plan.includePlateCrop) {
  payload.schema_version = '1.1';
  payload.summary.schema_version = '1.1';
  payload.events[0].schema_version = '1.1';
  payload.events[0].plate_crop_path = 'evidence/plate.jpg';
}
fs.mkdirSync(path.join(output, 'evidence'), { recursive: true });
if (!plan.noEvidence) fs.copyFileSync(path.join(process.cwd(), 'fake-evidence.jpg'), path.join(output, 'evidence/event.jpg'));
if (plan.includePlateCrop) fs.copyFileSync(path.join(process.cwd(), 'fake-plate-crop.jpg'), path.join(output, 'evidence/plate.jpg'));
if (!plan.noJson) fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(payload));
process.exit(plan.exitCode ?? 0);
`;

const jpegBytes = Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSkpOTlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z',
  'base64',
);

(runIntegration ? describe : describe.skip)('AI API to worker E2E integration', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let moduleRef: TestingModule;
  let worker: AiJobWorkerService;
  let importer: AiResultImportService;
  let storageRoot: string;
  let fixtureRoot: string;
  let fakePython: string;
  let baseUrl: string;
  let token: string;
  let repeatResultRoot: string | undefined;
  let originalEnvironment: NodeJS.ProcessEnv | undefined;
  const createdVideoIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdEvidenceIds: string[] = [];
  const createdCameraIds: string[] = [];

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    const safeUrl = assertSafeTestDatabaseUrl(testDatabaseUrl);
    storageRoot = await mkdtemp(join(tmpdir(), 'ai-e2e-storage-'));
    fixtureRoot = await mkdtemp(join(tmpdir(), 'ai-e2e-fixtures-'));
    fakePython = join(fixtureRoot, 'fake-python-e2e');
    await writeFile(fakePython, fakePythonSource);
    await chmod(fakePython, 0o755);
    await writeFile(join(fixtureRoot, 'fake-evidence.jpg'), jpegBytes);
    await writeFile(join(fixtureRoot, 'fake-plate-crop.jpg'), jpegBytes);
    await writeFile(join(fixtureRoot, 'fake-plan.json'), JSON.stringify({}));

    token = randomBytes(32).toString('hex');
    originalEnvironment = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: safeUrl,
      TEST_DATABASE_URL: safeUrl,
      INTERNAL_API_TOKEN: token,
      STORAGE_ROOT: storageRoot,
      MAX_UPLOAD_SIZE: String(10 * 1024 * 1024),
      CORS_ORIGIN: 'http://127.0.0.1',
      AI_PYTHON_BIN: fakePython,
      AI_SERVICE_ROOT: fixtureRoot,
      AI_JOB_TIMEOUT_MS: '1500',
      AI_WORKER_POLL_INTERVAL_MS: '50',
      AI_WORKER_CONCURRENCY: '1',
      AI_KEEP_FAILED_WORKDIR: 'false',
    });

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: safeUrl }) });
    await prisma.$connect();
    const [{ AppModule }, { WorkerModule }] = await Promise.all([
      import('../src/app.module'),
      import('../src/worker/worker.module'),
    ]);
    moduleRef = await Test.createTestingModule({ imports: [AppModule, WorkerModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableCors({ origin: ['http://127.0.0.1'], credentials: false });
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Traffic Monitoring Backend')
      .setVersion('2.0')
      .addApiKey({ type: 'apiKey', name: 'X-Internal-Token', in: 'header' }, 'internal-token')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig));
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    worker = moduleRef.get(AiJobWorkerService);
    importer = moduleRef.get(AiResultImportService);
  });

  beforeEach(async () => {
    if (!prisma) return;
    expect(await prisma.processingJob.count({ where: { status: ProcessingJobStatus.PENDING } })).toBe(0);
    repeatResultRoot = undefined;
    await configureFake({});
  });

  afterEach(async () => {
    if (!prisma) return;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    if (prisma) await cleanupCreatedRows();
    await app?.close();
    await prisma?.$disconnect();
    if (originalEnvironment) {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnvironment)) delete process.env[key];
      }
      Object.assign(process.env, originalEnvironment);
    }
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
  });

  it('uploads video, creates job, runs fake Python, imports results, and serves event evidence', async () => {
    const { videoId, jobId } = await createVideoAndJob();
    await configureFake({ includePlateCrop: true }, jobId);

    await expect(worker.claimAndRunOne()).resolves.toBe(true);

    const jobResponse = await fetch(`${baseUrl}/api/v1/jobs/${jobId}`);
    expect(jobResponse.status).toBe(200);
    const job = await jobResponse.json() as { status: string; totalEvents: number };
    expect(job).toMatchObject({ status: 'COMPLETED', totalEvents: 1 });

    const eventsResponse = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/events`);
    expect(eventsResponse.status).toBe(200);
    const events = await eventsResponse.json() as Array<{
      id: string;
      evidenceAssets: Array<{ id: string; assetType: string; mimeType: string | null }>;
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.evidenceAssets).toHaveLength(2);
    const eventId = events[0].id;
    const plateCrop = events[0].evidenceAssets.find((asset) => asset.assetType === 'PLATE_CROP');
    expect(plateCrop).toMatchObject({ mimeType: 'image/jpeg' });
    const evidenceId = plateCrop!.id;
    createdEventIds.push(eventId);
    createdEvidenceIds.push(...events[0].evidenceAssets.map((asset) => asset.id));

    const response = await fetch(`${baseUrl}/api/v1/evidence/${evidenceId}/content`, {
      headers: { 'X-Internal-Token': token },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(jpegBytes);
    expect(await prisma.processingJob.findUnique({ where: { id: jobId }, select: { videoId: true } }))
      .toMatchObject({ videoId });
  });

  it('imports Python exit 1 FAILED JSON and redacts the absolute temporary path', async () => {
    const { jobId } = await createVideoAndJob();
    const absoluteErrorPath = join(fixtureRoot, 'private video.mp4');
    await configureFake({ exitCode: 1, status: 'FAILED', error: `Could not read "${absoluteErrorPath}"` }, jobId);

    await expect(worker.claimAndRunOne()).resolves.toBe(true);

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toContain('Could not read');
    expect(job.errorMessage).not.toContain(fixtureRoot);
    expect(job.errorMessage).not.toContain(absoluteErrorPath);
  });

  it('marks Python exit 2 without JSON as FAILED', async () => {
    const { jobId } = await createVideoAndJob();
    await configureFake({ exitCode: 2, noJson: true }, jobId);

    await expect(worker.claimAndRunOne()).resolves.toBe(true);

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toContain('results.json');
  });

  it('times out fake Python and confirms its child process stops writing', async () => {
    const { jobId } = await createVideoAndJob();
    const marker = join(fixtureRoot, `e2e-timeout-${randomUUID()}.txt`);
    const pidPath = join(fixtureRoot, `e2e-timeout-${randomUUID()}.pid`);
    const parentPidPath = join(fixtureRoot, `e2e-python-${randomUUID()}.pid`);
    await configureFake({ delayMs: 5_000, childMarker: marker, childPid: pidPath, parentPid: parentPidPath }, jobId);

    await expect(worker.claimAndRunOne()).resolves.toBe(true);

    const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe(ProcessingJobStatus.FAILED);
    expect(job.errorMessage).toContain('timeout');
    const pythonPid = Number(await readFile(parentPidPath, 'utf8'));
    let pythonStillRunning = true;
    try {
      process.kill(pythonPid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') pythonStillRunning = false;
      else throw error;
    }
    expect(pythonStillRunning).toBe(false);
    const stoppedSize = (await readFile(marker, 'utf8').catch(() => '')).length;
    expect(stoppedSize).toBeGreaterThan(0);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    expect((await readFile(marker, 'utf8').catch(() => '')).length).toBe(stoppedSize);
    await rm(marker, { force: true });
    await rm(pidPath, { force: true });
    await rm(parentPidPath, { force: true });
  });

  it('rejects unsupported extension, MIME, and signature without storing video', async () => {
    const beforeCount = await prisma.video.count();
    const beforeFiles = await storageVideoFiles();
    const cases = [
      { name: 'input.txt', type: 'video/mp4', bytes: validMp4Bytes() },
      { name: 'input.mp4', type: 'video/quicktime', bytes: validMp4Bytes() },
      { name: 'input.mp4', type: 'video/mp4', bytes: Buffer.alloc(16, 0x61) },
    ];

    for (const upload of cases) {
      const response = await postUpload(upload.name, upload.type, upload.bytes, token);
      expect(response.status).toBe(400);
    }

    expect(await prisma.video.count()).toBe(beforeCount);
    expect(await storageVideoFiles()).toEqual(beforeFiles);
  });

  it('rejects missing or incorrect tokens on upload and job creation without writes', async () => {
    const beforeVideos = await prisma.video.count();
    const beforeJobs = await prisma.processingJob.count();
    const beforeFiles = await storageVideoFiles();
    for (const supplied of [undefined, 'incorrect-token']) {
      const upload = await postUpload('input.mp4', 'video/mp4', validMp4Bytes(), supplied);
      expect(upload.status).toBe(401);
      const job = await fetch(`${baseUrl}/api/v1/jobs`, {
        method: 'POST',
        headers: {
          ...(supplied ? { 'X-Internal-Token': supplied } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoId: randomUUID() }),
      });
      expect(job.status).toBe(401);
    }
    expect(await prisma.video.count()).toBe(beforeVideos);
    expect(await prisma.processingJob.count()).toBe(beforeJobs);
    expect(await storageVideoFiles()).toEqual(beforeFiles);
  });

  it('reviews an event with a token and rejects invalid review requests', async () => {
    const { jobId } = await createVideoAndJob();
    await configureFake({}, jobId);
    await worker.claimAndRunOne();
    const event = await prisma.detectionEvent.findFirstOrThrow({ where: { jobId } });
    createdEventIds.push(event.id);

    const valid = await fetch(`${baseUrl}/api/v1/events/${event.id}/review`, {
      method: 'PATCH',
      headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: ReviewStatus.VERIFIED_CROSSING, note: '  reviewed in E2E  ' }),
    });
    expect(valid.status).toBe(200);
    const reviewed = await prisma.detectionEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(reviewed.reviewStatus).toBe(ReviewStatus.VERIFIED_CROSSING);
    expect(reviewed.reviewNote).toBe('reviewed in E2E');
    expect(reviewed.reviewedAt).not.toBeNull();

    for (const supplied of [undefined, 'incorrect-token']) {
      const response = await fetch(`${baseUrl}/api/v1/events/${event.id}/review`, {
        method: 'PATCH',
        headers: {
          ...(supplied ? { 'X-Internal-Token': supplied } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reviewStatus: ReviewStatus.REJECTED_CANDIDATE }),
      });
      expect(response.status).toBe(401);
    }

    for (const reviewStatus of [ReviewStatus.PENDING_REVIEW, 'NOT_A_REVIEW_STATUS']) {
      const response = await fetch(`${baseUrl}/api/v1/events/${event.id}/review`, {
        method: 'PATCH',
        headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewStatus }),
      });
      expect(response.status).toBe(400);
    }

    const missing = await fetch(`${baseUrl}/api/v1/events/${randomUUID()}/review`, {
      method: 'PATCH',
      headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus: ReviewStatus.VERIFIED_CROSSING }),
    });
    expect(missing.status).toBe(404);
  });

  it('protects evidence content and returns 404 for absent assets or files', async () => {
    const { jobId } = await createVideoAndJob();
    await configureFake({}, jobId);
    await worker.claimAndRunOne();
    const asset = await prisma.evidenceAsset.findFirstOrThrow({ where: { event: { jobId } } });
    createdEvidenceIds.push(asset.id);
    const storedPath = join(storageRoot, asset.storageKey);

    const unauthorized = await fetch(`${baseUrl}/api/v1/evidence/${asset.id}/content`);
    expect(unauthorized.status).toBe(401);
    const absentAsset = await fetch(`${baseUrl}/api/v1/evidence/${randomUUID()}/content`, {
      headers: { 'X-Internal-Token': token },
    });
    expect(absentAsset.status).toBe(404);

    await rm(storedPath, { force: true });
    const absentFile = await fetch(`${baseUrl}/api/v1/evidence/${asset.id}/content`, {
      headers: { 'X-Internal-Token': token },
    });
    expect(absentFile.status).toBe(404);
  });

  it('re-imports identical event and evidence without duplicates', async () => {
    const { jobId } = await createVideoAndJob();
    const payload = await configureFake({}, jobId);
    await worker.claimAndRunOne();
    const firstEvent = await prisma.detectionEvent.findFirstOrThrow({ where: { jobId } });
    const firstAssets = await prisma.evidenceAsset.findMany({ where: { eventId: firstEvent.id } });
    createdEventIds.push(firstEvent.id);
    createdEvidenceIds.push(...firstAssets.map((asset) => asset.id));

    repeatResultRoot = await mkdtemp(join(fixtureRoot, 'repeat-result-'));
    await mkdir(join(repeatResultRoot, 'evidence'), { recursive: true });
    await writeFile(join(repeatResultRoot, 'evidence/event.jpg'), jpegBytes);
    await importer.import(jobId, payload, repeatResultRoot);

    const events = await prisma.detectionEvent.findMany({ where: { jobId } });
    const assets = await prisma.evidenceAsset.findMany({ where: { eventId: firstEvent.id } });
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(firstEvent.id);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.id).toBe(firstAssets[0]?.id);
    expect(await readdir(join(storageRoot, 'evidence', jobId))).toEqual([`${firstEvent.sourceEventId}.jpg`]);
  });

  async function createVideoAndJob(): Promise<{ videoId: string; jobId: string }> {
    const uploaded = await postUpload('e2e-input.mp4', 'video/mp4', validMp4Bytes(), token);
    expect(uploaded.status).toBe(201);
    const video = await uploaded.json() as { id: string };
    createdVideoIds.push(video.id);
    const response = await fetch(`${baseUrl}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: video.id }),
    });
    expect(response.status).toBe(201);
    const job = await response.json() as { id: string };
    createdJobIds.push(job.id);
    return { videoId: video.id, jobId: job.id };
  }

  async function configureFake(plan: Record<string, unknown>, jobId?: string): Promise<AiProcessingResultDto> {
    const result = JSON.parse(JSON.stringify(makeAiResult())) as AiProcessingResultDto;
    result.summary.job_id = jobId ?? randomUUID();
    result.events[0].event_id = randomUUID();
    result.events[0].evidence_path = 'evidence/event.jpg';
    await writeFile(join(fixtureRoot, 'fake-result.json'), JSON.stringify(result));
    await writeFile(join(fixtureRoot, 'fake-plan.json'), JSON.stringify(plan));
    return result;
  }

  async function postUpload(
    filename: string,
    mimeType: string,
    bytes: Buffer,
    suppliedToken?: string,
  ): Promise<Response> {
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(bytes)], { type: mimeType }), filename);
    return fetch(`${baseUrl}/api/v1/videos/upload`, {
      method: 'POST',
      headers: suppliedToken ? { 'X-Internal-Token': suppliedToken } : {},
      body: form,
    });
  }

  async function storageVideoFiles(): Promise<string[]> {
    try {
      return await readdir(join(storageRoot, 'videos'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async function cleanupCreatedRows(): Promise<void> {
    const jobIds = [...new Set(createdJobIds)];
    const videoIds = [...new Set(createdVideoIds)];
    const eventIds = new Set(createdEventIds);
    const evidenceIds = new Set(createdEvidenceIds);
    if (jobIds.length > 0) {
      const events = await prisma.detectionEvent.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } });
      for (const event of events) eventIds.add(event.id);
      const assets = await prisma.evidenceAsset.findMany({ where: { event: { jobId: { in: jobIds } } }, select: { id: true } });
      for (const asset of assets) evidenceIds.add(asset.id);
    }
    if (evidenceIds.size > 0) await prisma.evidenceAsset.deleteMany({ where: { id: { in: [...evidenceIds] } } });
    if (eventIds.size > 0) await prisma.detectionEvent.deleteMany({ where: { id: { in: [...eventIds] } } });
    if (jobIds.length > 0) await prisma.processingJob.deleteMany({ where: { id: { in: jobIds } } });
    if (videoIds.length > 0) await prisma.video.deleteMany({ where: { id: { in: videoIds } } });
    if (createdCameraIds.length > 0) await prisma.camera.deleteMany({ where: { id: { in: createdCameraIds } } });
    createdJobIds.length = 0;
    createdVideoIds.length = 0;
    createdEventIds.length = 0;
    createdEvidenceIds.length = 0;
    createdCameraIds.length = 0;
    if (repeatResultRoot) await rm(repeatResultRoot, { recursive: true, force: true });
  }

  function validMp4Bytes(): Buffer {
    const bytes = Buffer.alloc(16);
    bytes.write('ftyp', 4, 'ascii');
    return bytes;
  }
});
