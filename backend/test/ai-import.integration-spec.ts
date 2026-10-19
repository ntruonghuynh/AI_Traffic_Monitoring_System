import { TestingModule, Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  EvidenceAssetType,
  PrismaClient,
  ProcessingJobStatus,
} from '../src/generated/prisma/client';
import { AiResultImportService } from '../src/ai-results/ai-result-import.service';
import { AiProcessingResultDto } from '../src/ai-results/dto/ai-result.dto';
import { PrismaService } from '../src/prisma/prisma.service';
import { LocalStorageService } from '../src/storage/local-storage.service';
import { makeAiResult } from './fixtures/ai-result.fixture';

const testUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testUrl);
const smallJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+L6KKK/lM/38P//Z',
  'base64',
);

(runIntegration ? describe : describe.skip)('AI result import PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let moduleRef: TestingModule;
  let importer: AiResultImportService;
  let storageRoot: string;
  let resultRoot: string;
  let videoId: string | undefined;
  let jobId: string | undefined;

  beforeAll(async () => {
    if (!testUrl) return;
    const parsedUrl = new URL(testUrl);
    const databaseName = parsedUrl.pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('TEST_DATABASE_URL phải trỏ tới database có hậu tố _test');
    }
    const allowedPorts = process.env.CI === 'true' ? ['5432', '5433'] : ['5433'];
    if (
      databaseName !== 'traffic_monitoring_test'
      || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)
      || !allowedPorts.includes(parsedUrl.port)
    ) {
      throw new Error(
        `Integration test chỉ được dùng traffic_monitoring_test trên localhost (cổng ${allowedPorts.join(' hoặc ')})`,
      );
    }

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
    await prisma.$connect();
    storageRoot = await mkdtemp(join(tmpdir(), 'ai-import-storage-'));
    resultRoot = await mkdtemp(join(tmpdir(), 'ai-import-results-'));
    await mkdir(join(resultRoot, 'evidence'), { recursive: true });
    await writeFile(join(resultRoot, 'evidence', 'event.jpg'), smallJpeg);

    moduleRef = await Test.createTestingModule({
      providers: [
        AiResultImportService,
        LocalStorageService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key !== 'STORAGE_ROOT') throw new Error(`Unexpected config key: ${key}`);
              return storageRoot;
            },
          },
        },
      ],
    }).compile();
    importer = moduleRef.get(AiResultImportService);
  });

  beforeEach(async () => {
    videoId = undefined;
    jobId = undefined;
    if (!prisma) return;

    const video = await prisma.video.create({
      data: {
        originalFilename: 'input_video.mp4',
        storageKey: `integration/${randomUUID()}.mp4`,
        mimeType: 'video/mp4',
        fileSize: 1n,
      },
    });
    videoId = video.id;
    const job = await prisma.processingJob.create({
      data: { videoId: video.id, status: ProcessingJobStatus.PENDING },
    });
    jobId = job.id;
  });

  afterEach(async () => {
    if (!prisma) return;
    if (jobId) await prisma.processingJob.deleteMany({ where: { id: jobId } });
    if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma?.$disconnect();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (resultRoot) await rm(resultRoot, { recursive: true, force: true });
  });

  it('imports JSON, completes the job, and persists the event fields', async () => {
    const job = requireJobId();
    const { payload, eventId } = createResult(job, null);

    const result = await importer.import(job, payload, resultRoot);
    const event = await prisma.detectionEvent.findUnique({
      where: { jobId_sourceEventId: { jobId: job, sourceEventId: eventId } },
    });
    const updatedVideo = await prisma.video.findUnique({ where: { id: videoId! } });

    expect(result.status).toBe(ProcessingJobStatus.COMPLETED);
    expect(result._count.events).toBe(1);
    expect(event).toMatchObject({
      jobId: job,
      sourceEventId: eventId,
      eventType: 'LINE_CROSSING_CANDIDATE',
      reviewStatus: 'PENDING_REVIEW',
      trackId: 12,
      vehicleType: 'motorcycle',
      confidence: 0.91,
      frameIndex: 50,
      timestampSeconds: 2,
      crossingDirection: 'positive_to_negative',
    });
    expect(updatedVideo).toMatchObject({ width: 1280, height: 720, durationSeconds: 4 });
  });

  it('is idempotent for the same JSON and keeps the DetectionEvent id', async () => {
    const job = requireJobId();
    const { payload, eventId } = createResult(job, null);

    await importer.import(job, payload, resultRoot);
    const first = await prisma.detectionEvent.findUniqueOrThrow({
      where: { jobId_sourceEventId: { jobId: job, sourceEventId: eventId } },
    });
    await importer.import(job, payload, resultRoot);

    const events = await prisma.detectionEvent.findMany({ where: { jobId: job } });
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(first.id);
  });

  it('imports one evidence asset and copies the JPEG into temporary storage', async () => {
    const job = requireJobId();
    const { payload, eventId } = createResult(job, 'evidence/event.jpg');

    await importer.import(job, payload, resultRoot);

    const event = await prisma.detectionEvent.findUniqueOrThrow({
      where: { jobId_sourceEventId: { jobId: job, sourceEventId: eventId } },
    });
    const assets = await prisma.evidenceAsset.findMany({ where: { eventId: event.id } });
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      assetType: EvidenceAssetType.IMAGE,
      storageKey: `evidence/${job}/${eventId}.jpg`,
      mimeType: 'image/jpeg',
    });
    await expect(readFile(join(storageRoot, assets[0].storageKey))).resolves.toEqual(smallJpeg);
  });

  it('is idempotent for evidence and leaves one asset and one file', async () => {
    const job = requireJobId();
    const { payload, eventId } = createResult(job, 'evidence/event.jpg');

    await importer.import(job, payload, resultRoot);
    const event = await prisma.detectionEvent.findUniqueOrThrow({
      where: { jobId_sourceEventId: { jobId: job, sourceEventId: eventId } },
    });
    const firstAsset = await prisma.evidenceAsset.findFirstOrThrow({ where: { eventId: event.id } });
    await importer.import(job, payload, resultRoot);

    const assets = await prisma.evidenceAsset.findMany({ where: { eventId: event.id } });
    const files = await readdir(join(storageRoot, 'evidence', job));
    expect(assets).toHaveLength(1);
    expect(assets[0]?.id).toBe(firstAsset.id);
    expect(files).toEqual([`${eventId}.jpg`]);
  });

  it('rejects a mismatched summary job_id without changing the job or events', async () => {
    const job = requireJobId();
    const { payload } = createResult(randomUUID(), null);

    await expect(importer.import(job, payload, resultRoot)).rejects.toThrow('summary.job_id không trùng --job-id');
    const persistedJob = await prisma.processingJob.findUniqueOrThrow({ where: { id: job } });
    const events = await prisma.detectionEvent.findMany({ where: { jobId: job } });
    expect(persistedJob.status).toBe(ProcessingJobStatus.PENDING);
    expect(persistedJob.totalEvents).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('rejects a job that does not exist without creating events', async () => {
    const missingJobId = randomUUID();
    const { payload } = createResult(missingJobId, null);

    await expect(importer.import(missingJobId, payload, resultRoot)).rejects.toThrow('Không tìm thấy processing job');
    expect(await prisma.processingJob.findUnique({ where: { id: missingJobId } })).toBeNull();
    expect(await prisma.detectionEvent.count({ where: { jobId: missingJobId } })).toBe(0);
  });

  function requireJobId(): string {
    if (!jobId) throw new Error('Test job was not created');
    return jobId;
  }

  function createResult(job: string, evidencePath: string | null) {
    const payload = JSON.parse(JSON.stringify(makeAiResult())) as AiProcessingResultDto;
    const eventId = randomUUID();
    payload.summary.job_id = job;
    payload.events[0].event_id = eventId;
    payload.events[0].evidence_path = evidencePath;
    return { payload, eventId };
  }
});
