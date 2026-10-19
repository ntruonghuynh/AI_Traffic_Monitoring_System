import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { DetectionEventsController } from '../src/detection-events/detection-events.controller';
import { DetectionEventsService } from '../src/detection-events/detection-events.service';
import { InternalTokenGuard } from '../src/common/guards/internal-token.guard';
import { StatsController } from '../src/stats/stats.controller';
import { StatsService } from '../src/stats/stats.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl, runIntegration, testDatabaseUrl } from './helpers/test-database';

interface StatsOverview {
  cameras: { total: number; byStatus: Record<string, number> };
  videos: { total: number };
  jobs: { total: number; byStatus: Record<string, number> };
  events: { total: number; byReviewStatus: Record<string, number> };
}

interface EventPage {
  data: Array<{ id: string }>;
  meta: { total: number };
}

interface GroupResult {
  items: Array<{ key: string | null; count: number }>;
}

(runIntegration ? describe : describe.skip)('Stats and event filters PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let baseUrl: string;
  let eventIds: string[] = [];
  let jobId: string | undefined;
  let videoId: string | undefined;
  let cameraId: string | undefined;
  let baselineOverview: StatsOverview;
  let baselineGroups: Record<string, number>;
  let uniqueVehicleType: string;
  const sampleDay = new Date('2040-08-09T12:00:00.000Z');
  const dayStart = new Date('2040-08-09T00:00:00.000Z');
  const dayEnd = new Date('2040-08-09T23:59:59.999Z');

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    const safeUrl = assertSafeTestDatabaseUrl(testDatabaseUrl);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: safeUrl }) });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      controllers: [StatsController, DetectionEventsController],
      providers: [
        StatsService,
        DetectionEventsService,
        InternalTokenGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    // Keep the same route prefix and query validation as the production API.
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }));
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string') throw new Error('Nest test app did not bind to a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  beforeEach(async () => {
    eventIds = [];
    uniqueVehicleType = `test-${randomUUID()}`;
    jobId = undefined;
    videoId = undefined;
    cameraId = undefined;
    if (!prisma) return;

    baselineOverview = await getJson<StatsOverview>(`${baseUrl}/stats/overview`);
    baselineGroups = {
      vehicle: await groupedCount('vehicleType', uniqueVehicleType),
      day: await groupedCount('day', '2040-08-09'),
      pending: await groupedCount('reviewStatus', 'PENDING_REVIEW'),
      verified: await groupedCount('reviewStatus', 'VERIFIED_CROSSING'),
    };

    const camera = await prisma.camera.create({ data: { name: `Stats ${randomUUID()}`, location: 'Integration test' } });
    cameraId = camera.id;
    const video = await prisma.video.create({
      data: {
        cameraId: camera.id,
        originalFilename: 'stats-integration.mp4',
        storageKey: `integration/${randomUUID()}.mp4`,
        mimeType: 'video/mp4',
        fileSize: 12n,
      },
    });
    videoId = video.id;
    const job = await prisma.processingJob.create({ data: { videoId: video.id } });
    jobId = job.id;
    const common = {
      jobId: job.id,
      eventType: 'LINE_CROSSING_CANDIDATE' as const,
      vehicleType: uniqueVehicleType,
      createdAt: sampleDay,
      updatedAt: sampleDay,
      rawPayload: {},
    };
    const events = await Promise.all([
      prisma.detectionEvent.create({
        data: {
          ...common,
          sourceEventId: randomUUID(),
          reviewStatus: 'VERIFIED_CROSSING',
          plateNumber: '59A-12345',
          confidence: 0.95,
        },
      }),
      prisma.detectionEvent.create({
        data: {
          ...common,
          sourceEventId: randomUUID(),
          reviewStatus: 'PENDING_REVIEW',
          plateNumber: null,
          confidence: 0.4,
        },
      }),
    ]);
    eventIds = events.map((event) => event.id);
  });

  afterEach(async () => {
    if (!prisma) return;
    if (eventIds.length) await prisma.detectionEvent.deleteMany({ where: { id: { in: eventIds } } });
    if (jobId) await prisma.processingJob.deleteMany({ where: { id: jobId } });
    if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
    if (cameraId) await prisma.camera.deleteMany({ where: { id: cameraId } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('reports isolated overview/group counts and applies camera, plate, and confidence filters', async () => {
    const after = await getJson<StatsOverview>(`${baseUrl}/stats/overview`);
    expect(after.cameras.total - baselineOverview.cameras.total).toBe(1);
    expect(after.videos.total - baselineOverview.videos.total).toBe(1);
    expect(after.jobs.total - baselineOverview.jobs.total).toBe(1);
    expect(after.events.total - baselineOverview.events.total).toBe(2);
    expect(after.cameras.byStatus.ACTIVE - baselineOverview.cameras.byStatus.ACTIVE).toBe(1);
    expect(after.jobs.byStatus.PENDING - baselineOverview.jobs.byStatus.PENDING).toBe(1);
    expect(after.events.byReviewStatus.PENDING_REVIEW - baselineOverview.events.byReviewStatus.PENDING_REVIEW).toBe(1);
    expect(after.events.byReviewStatus.VERIFIED_CROSSING - baselineOverview.events.byReviewStatus.VERIFIED_CROSSING).toBe(1);

    expect(await groupedCount('vehicleType', uniqueVehicleType)).toBe(baselineGroups.vehicle + 2);
    expect(await groupedCount('day', '2040-08-09')).toBe(baselineGroups.day + 2);
    expect(await groupedCount('reviewStatus', 'PENDING_REVIEW')).toBe(baselineGroups.pending + 1);
    expect(await groupedCount('reviewStatus', 'VERIFIED_CROSSING')).toBe(baselineGroups.verified + 1);

    const query = new URLSearchParams({ cameraId: cameraId!, hasPlate: 'true', minConfidence: '0.9' });
    const withPlate = await getJson<EventPage>(`${baseUrl}/events?${query}`);
    expect(withPlate.meta.total).toBe(1);
    expect(withPlate.data[0].id).toBe(eventIds[0]);

    query.set('hasPlate', 'false');
    query.set('minConfidence', '0.3');
    const withoutPlate = await getJson<EventPage>(`${baseUrl}/events?${query}`);
    expect(withoutPlate.meta.total).toBe(1);
    expect(withoutPlate.data[0].id).toBe(eventIds[1]);
  });

  it('returns HTTP 400 for an invalid event groupBy value', async () => {
    const response = await fetch(`${baseUrl}/stats/events?groupBy=hour`);
    expect(response.status).toBe(400);
  });

  async function groupedCount(groupBy: string, key: string): Promise<number> {
    const query = new URLSearchParams({
      groupBy,
      from: dayStart.toISOString(),
      to: dayEnd.toISOString(),
    });
    const result = await getJson<GroupResult>(`${baseUrl}/stats/events?${query}`);
    return result.items.find((item: { key: string | null }) => item.key === key)?.count ?? 0;
  }

  async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    const result: unknown = await response.json();
    return result as T;
  }
});
