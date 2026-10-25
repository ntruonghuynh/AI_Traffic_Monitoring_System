import 'reflect-metadata';
import { ForbiddenException, HttpException, NotFoundException, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { VideosController } from './videos.controller';
import { parseByteRange, VideosService } from './videos.service';

const VIDEO_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_BYTES = Buffer.from('0123456789');

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

describe('GET /videos/:id/content', () => {
  let root: string;
  let storage: LocalStorageService;
  let service: VideosService;
  let controller: VideosController;
  let video: { id: string; storageKey: string; mimeType: string };
  let findUnique: jest.Mock<(args: unknown) => Promise<typeof video | null>>;
  const token = 'video-content-test-internal-token';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'videos-content-test-'));
    await mkdir(join(root, 'videos'));
    await writeFile(join(root, 'videos/sample.mp4'), VIDEO_BYTES);
    video = { id: VIDEO_ID, storageKey: 'videos/sample.mp4', mimeType: 'video/mp4' };
    findUnique = jest.fn(() => Promise.resolve(video));
    const prisma = { video: { findUnique } } as unknown as PrismaService;
    const config = {
      get: (key: string) => key === 'INTERNAL_API_TOKEN' ? token : undefined,
      getOrThrow: (key: string) => key === 'STORAGE_ROOT' ? root : 100_000,
    } as unknown as ConfigService;
    storage = new LocalStorageService(config);
    service = new VideosService(prisma, storage, config);
    controller = new VideosController(service);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('protects the content route with InternalTokenGuard and streams the requested video', async () => {
    const routeGuards = Reflect.getMetadata(GUARDS_METADATA, VideosController.prototype.content) as unknown[];
    expect(routeGuards).toContain(InternalTokenGuard);

    const guard = new InternalTokenGuard({ get: (key: string) => key === 'INTERNAL_API_TOKEN' ? token : undefined } as unknown as ConfigService);
    expect(guard.canActivate(guardContext(token))).toBe(true);

    const harness = responseHarness();
    const result = await controller.content(VIDEO_ID, undefined, harness.response);
    expect(result).toBeInstanceOf(StreamableFile);
    await expect(streamToBuffer(result.getStream())).resolves.toEqual(VIDEO_BYTES);
    expect(harness.status).toHaveBeenCalledWith(200);
    expect(harness.headers.get('content-type')).toBe('video/mp4');
    expect(harness.headers.get('content-length')).toBe(String(VIDEO_BYTES.length));
    expect(harness.headers.get('cache-control')).toBe('private, no-store');
    expect(harness.headers.get('accept-ranges')).toBe('bytes');
    expect(harness.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...harness.headers.values()].join(' ')).not.toContain(root);
  });

  it('returns 401 for missing or incorrect token and 403 when no token is configured', () => {
    const guard = new InternalTokenGuard({ get: (key: string) => key === 'INTERNAL_API_TOKEN' ? token : undefined } as unknown as ConfigService);
    expect(() => guard.canActivate(guardContext())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(guardContext('wrong-token'))).toThrow(UnauthorizedException);
    expect(exceptionStatus(() => guard.canActivate(guardContext()))).toBe(401);
    expect(exceptionStatus(() => guard.canActivate(guardContext('wrong-token')))).toBe(401);

    const unconfigured = new InternalTokenGuard({ get: () => undefined } as unknown as ConfigService);
    expect(() => unconfigured.canActivate(guardContext(token))).toThrow(ForbiddenException);
    expect(exceptionStatus(() => unconfigured.canActivate(guardContext(token)))).toBe(403);
  });

  it('returns 404 for a missing video record or storage file', async () => {
    findUnique.mockImplementationOnce(() => Promise.resolve(null));
    await expect(service.content(VIDEO_ID)).rejects.toThrow(NotFoundException);

    video.storageKey = 'videos/missing.mp4';
    await expect(service.content(VIDEO_ID)).rejects.toThrow(NotFoundException);
  });

  it('defaults an absent video mimeType to video/mp4', async () => {
    video.mimeType = '';
    await expect(service.content(VIDEO_ID)).resolves.toMatchObject({ contentType: 'video/mp4', statusCode: 200 });
  });

  it('streams a valid byte range with 206 and returns 416 for an invalid range', async () => {
    const partial = await service.content(VIDEO_ID, 'bytes=2-5');
    expect(partial.statusCode).toBe(206);
    expect(partial.contentLength).toBe(4);
    expect(partial.contentRange).toBe('bytes 2-5/10');
    await expect(streamToBuffer(partial.stream!)).resolves.toEqual(Buffer.from('2345'));

    const invalid = await service.content(VIDEO_ID, 'bytes=99-100');
    expect(invalid).toMatchObject({ statusCode: 416, stream: null, contentLength: 0, contentRange: 'bytes */10' });

    const harness = responseHarness();
    const partialResponse = await controller.content(VIDEO_ID, 'bytes=2-5', harness.response);
    expect(harness.status).toHaveBeenCalledWith(206);
    expect(harness.headers.get('content-range')).toBe('bytes 2-5/10');
    await expect(streamToBuffer(partialResponse.getStream())).resolves.toEqual(Buffer.from('2345'));

    const invalidHarness = responseHarness();
    await controller.content(VIDEO_ID, 'bytes=99-', invalidHarness.response);
    expect(invalidHarness.status).toHaveBeenCalledWith(416);
  });

  it('destroys the opened stream when the response closes before completion', async () => {
    const stream = new PassThrough();
    const destroy = jest.spyOn(stream, 'destroy');
    jest.spyOn(service, 'content').mockResolvedValue({
      stream: stream as unknown as ReadStream,
      statusCode: 200,
      contentType: 'video/mp4',
      contentLength: VIDEO_BYTES.length,
    });
    const harness = responseHarness();

    await controller.content(VIDEO_ID, undefined, harness.response);
    expect(destroy).not.toHaveBeenCalled();
    harness.response.emit('close');

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(stream.destroyed).toBe(true);
    expect(harness.response.listenerCount('close')).toBe(0);
  });

  it('does not destroy the stream after the response completed normally', async () => {
    const stream = new PassThrough();
    const destroy = jest.spyOn(stream, 'destroy');
    jest.spyOn(service, 'content').mockResolvedValue({
      stream: stream as unknown as ReadStream,
      statusCode: 200,
      contentType: 'video/mp4',
      contentLength: VIDEO_BYTES.length,
    });
    const harness = responseHarness();

    await controller.content(VIDEO_ID, undefined, harness.response);
    Object.defineProperty(harness.response, 'writableFinished', { value: true, configurable: true });
    harness.response.emit('close');

    expect(destroy).not.toHaveBeenCalled();
    expect(harness.response.listenerCount('close')).toBe(0);
  });

  it('rejects unsafe storage keys and symlinks that escape the storage root', async () => {
    video.storageKey = '../outside.mp4';
    await expect(service.content(VIDEO_ID)).rejects.toThrow(NotFoundException);

    const outside = join(root, '..', 'outside-video-content-test.mp4');
    await writeFile(outside, VIDEO_BYTES);
    try {
      await import('node:fs/promises').then(({ symlink }) => symlink(outside, join(root, 'videos/escape.mp4')));
      video.storageKey = 'videos/escape.mp4';
      await expect(service.content(VIDEO_ID)).rejects.toThrow(NotFoundException);
    } finally {
      await rm(outside, { force: true });
    }
  });

  it('parses suffix ranges and rejects malformed or multiple ranges', () => {
    expect(parseByteRange('bytes=-4', 10)).toEqual({ range: { start: 6, end: 9 }, unsatisfiable: false });
    expect(parseByteRange('bytes=1-2,5-6', 10)).toEqual({ range: null, unsatisfiable: true });
    expect(parseByteRange('bytes=10-', 10)).toEqual({ range: null, unsatisfiable: true });
  });
});
