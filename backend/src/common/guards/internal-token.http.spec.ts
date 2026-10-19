import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { InternalTokenGuard } from './internal-token.guard';
import { VideosController } from '../../videos/videos.controller';
import { VideosService } from '../../videos/videos.service';
import { ProcessingJobsController } from '../../processing-jobs/processing-jobs.controller';
import { ProcessingJobsService } from '../../processing-jobs/processing-jobs.service';

const TOKEN = 'a-secure-http-test-token-with-enough-entropy';
const VIDEO_ID = '0f24cb56-633b-4c55-8d22-315d198a9901';

describe('Internal token protected write routes over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  let configValues: Record<string, string | undefined>;
  const videos = { remove: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined) };
  const jobs = {
    create: jest.fn<(dto: { videoId: string }) => Promise<{ id: string; status: string }>>()
      .mockResolvedValue({ id: 'job-id', status: 'PENDING' }),
  };

  beforeAll(async () => {
    configValues = { NODE_ENV: 'development', INTERNAL_API_TOKEN: TOKEN };
    const moduleRef = await Test.createTestingModule({
      controllers: [VideosController, ProcessingJobsController],
      providers: [
        InternalTokenGuard,
        { provide: VideosService, useValue: videos },
        { provide: ProcessingJobsService, useValue: jobs },
        { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    configValues.NODE_ENV = 'development';
    configValues.INTERNAL_API_TOKEN = TOKEN;
    videos.remove.mockClear();
    jobs.create.mockClear();
  });

  const routes = [
    {
      name: 'DELETE /videos/:id',
      method: 'DELETE',
      path: `/api/v1/videos/${VIDEO_ID}`,
      body: undefined,
      successStatus: 204,
    },
    {
      name: 'POST /jobs',
      method: 'POST',
      path: '/api/v1/jobs',
      body: { videoId: VIDEO_ID },
      successStatus: 201,
    },
  ] as const;

  async function send(
    route: (typeof routes)[number],
    token?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (token !== undefined) headers['X-Internal-Token'] = token;
    if (route.body) headers['Content-Type'] = 'application/json';
    return fetch(`${baseUrl}${route.path}`, {
      method: route.method,
      headers,
      body: route.body ? JSON.stringify(route.body) : undefined,
    });
  }

  it.each(routes)('$name returns 401 when the token is missing', async (route) => {
    expect((await send(route)).status).toBe(401);
  });

  it.each(routes)('$name returns 401 when the token is incorrect', async (route) => {
    expect((await send(route, 'incorrect-token')).status).toBe(401);
  });

  it.each(routes)('$name reaches its service with a valid token', async (route) => {
    expect((await send(route, TOKEN)).status).toBe(route.successStatus);
    if (route.method === 'DELETE') expect(videos.remove).toHaveBeenCalledWith(VIDEO_ID);
    else expect(jobs.create).toHaveBeenCalledWith({ videoId: VIDEO_ID });
  });

  it.each(routes)('$name returns 403 when no token is configured', async (route) => {
    configValues.INTERNAL_API_TOKEN = undefined;
    expect((await send(route, TOKEN)).status).toBe(403);
  });
});
