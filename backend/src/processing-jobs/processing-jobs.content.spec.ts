import 'reflect-metadata';
import { ForbiddenException, HttpException, NotFoundException, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { EvidenceAssetType } from '../generated/prisma/client';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { ProcessingJobsController } from './processing-jobs.controller';
import { ProcessingJobsService } from './processing-jobs.service';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReadStream } from 'node:fs';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_BYTES = Buffer.from('annotated-video-bytes');
const TOKEN = 'annotated-video-test-internal-token';

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function guardContext(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (name: string) => name.toLowerCase() === 'x-internal-token' ? token : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function exceptionStatus(run: () => boolean): number | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : null;
  }
}

function responseHarness() {
  const emitter = new EventEmitter();
  const headers = new Map<string, string>();
  const status = jest.fn();
  const setHeader = jest.fn((name: string, value: string) => headers.set(name.toLowerCase(), value));
  const response = Object.assign(emitter, { writableFinished: false, status, setHeader }) as unknown as Response;
  return { response, headers, status };
}

describe('GET /jobs/:id/annotated-video', () => {
  let root: string;
  let storage: LocalStorageService;
  let service: ProcessingJobsService;
  let controller: ProcessingJobsController;
  let asset: { storageKey: string } | null;
  let findJob: jest.Mock<(args: unknown) => Promise<{ id: string } | null>>;
  let findAsset: jest.Mock<(args: unknown) => Promise<typeof asset>>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'annotated-video-content-test-'));
    await mkdir(join(root, 'evidence', JOB_ID), { recursive: true });
    await writeFile(join(root, 'evidence', JOB_ID, 'annotated-video.mp4'), VIDEO_BYTES);
    asset = { storageKey: `evidence/${JOB_ID}/annotated-video.mp4` };
    findJob = jest.fn(() => Promise.resolve({ id: JOB_ID }));
    findAsset = jest.fn(() => Promise.resolve(asset));
    const prisma = {
      processingJob: { findUnique: findJob },
      evidenceAsset: { findFirst: findAsset },
    } as unknown as PrismaService;
    storage = new LocalStorageService({ getOrThrow: () => root } as unknown as ConfigService);
    service = new ProcessingJobsService(prisma, storage);
    controller = new ProcessingJobsController(service);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('protects the route with InternalTokenGuard and returns 401/403 for token failures', () => {
    const routeGuards = Reflect.getMetadata(GUARDS_METADATA, ProcessingJobsController.prototype.annotatedVideo) as unknown[];
    expect(routeGuards).toContain(InternalTokenGuard);

    const configured = new InternalTokenGuard({ get: (key: string) => key === 'INTERNAL_API_TOKEN' ? TOKEN : undefined } as unknown as ConfigService);
    expect(configured.canActivate(guardContext(TOKEN))).toBe(true);
    expect(() => configured.canActivate(guardContext())).toThrow(UnauthorizedException);
    expect(() => configured.canActivate(guardContext('wrong-token'))).toThrow(UnauthorizedException);
    expect(exceptionStatus(() => configured.canActivate(guardContext()))).toBe(401);
    expect(exceptionStatus(() => configured.canActivate(guardContext('wrong-token')))).toBe(401);

    const unconfigured = new InternalTokenGuard({ get: () => undefined } as unknown as ConfigService);
    expect(() => unconfigured.canActivate(guardContext(TOKEN))).toThrow(ForbiddenException);
    expect(exceptionStatus(() => unconfigured.canActivate(guardContext(TOKEN)))).toBe(403);
  });

  it('returns 404 when the job does not exist or has no annotated video', async () => {
    findJob.mockResolvedValueOnce(null);
    await expect(service.annotatedVideoContent(JOB_ID)).rejects.toThrow(NotFoundException);

    asset = null;
    await expect(service.annotatedVideoContent(JOB_ID)).rejects.toThrow('Job không có video chú thích');
  });

  it('streams the complete annotated video with protected content headers', async () => {
    const harness = responseHarness();
    const result = await controller.annotatedVideo(JOB_ID, undefined, harness.response);

    expect(result).toBeInstanceOf(StreamableFile);
    await expect(streamToBuffer(result.getStream())).resolves.toEqual(VIDEO_BYTES);
    expect(harness.status).toHaveBeenCalledWith(200);
    expect(harness.headers.get('content-type')).toBe('video/mp4');
    expect(harness.headers.get('content-length')).toBe(String(VIDEO_BYTES.length));
    expect(harness.headers.get('cache-control')).toBe('private, no-store');
    expect(harness.headers.get('accept-ranges')).toBe('bytes');
    expect(harness.headers.get('x-content-type-options')).toBe('nosniff');
    expect(harness.headers.get('content-disposition')).toBe(`inline; filename="${JOB_ID}-annotated.mp4"`);
    expect([...harness.headers.values()].join(' ')).not.toContain(root);
    expect(findAsset).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobId: JOB_ID, eventId: null, assetType: EvidenceAssetType.ANNOTATED_VIDEO },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }));
  });

  it('streams byte ranges with 206 and reports unsatisfiable ranges with 416', async () => {
    const partialHarness = responseHarness();
    const partial = await controller.annotatedVideo(JOB_ID, 'bytes=2-7', partialHarness.response);
    expect(partialHarness.status).toHaveBeenCalledWith(206);
    expect(partialHarness.headers.get('content-range')).toBe(`bytes 2-7/${VIDEO_BYTES.length}`);
    await expect(streamToBuffer(partial.getStream())).resolves.toEqual(VIDEO_BYTES.subarray(2, 8));

    const invalidHarness = responseHarness();
    await controller.annotatedVideo(JOB_ID, 'bytes=999-', invalidHarness.response);
    expect(invalidHarness.status).toHaveBeenCalledWith(416);
    expect(invalidHarness.headers.get('content-range')).toBe(`bytes */${VIDEO_BYTES.length}`);
  });

  it('destroys the file stream when the client closes early', async () => {
    const stream = new PassThrough();
    const destroy = jest.spyOn(stream, 'destroy');
    jest.spyOn(service, 'annotatedVideoContent').mockResolvedValue({
      stream: stream as unknown as ReadStream,
      statusCode: 200,
      contentType: 'video/mp4',
      contentLength: VIDEO_BYTES.length,
    });
    const harness = responseHarness();

    await controller.annotatedVideo(JOB_ID, undefined, harness.response);
    harness.response.emit('close');

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(stream.destroyed).toBe(true);
    expect(harness.response.listenerCount('close')).toBe(0);
  });

  it('rejects storage keys that escape the storage root', async () => {
    asset = { storageKey: '../outside.mp4' };
    await expect(service.annotatedVideoContent(JOB_ID)).rejects.toThrow(NotFoundException);
  });
});
