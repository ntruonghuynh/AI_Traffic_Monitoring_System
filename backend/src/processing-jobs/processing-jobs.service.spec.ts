import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { EvidenceAssetType, ProcessingJobStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { ProcessingJobsService } from './processing-jobs.service';

describe('ProcessingJobsService', () => {
  it('tạo job ở trạng thái PENDING cho video tồn tại', async () => {
    const create = jest.fn<() => Promise<{ id: string; status: ProcessingJobStatus }>>()
      .mockResolvedValue({ id: 'job-id', status: ProcessingJobStatus.PENDING });
    const prisma = {
      video: { findUnique: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'video-id' }) },
      processingJob: { create },
    } as unknown as PrismaService;
    const service = new ProcessingJobsService(prisma, {} as LocalStorageService);
    await expect(service.create({ videoId: 'video-id' })).resolves.toMatchObject({ status: ProcessingJobStatus.PENDING });
  });

  it('từ chối video không tồn tại', async () => {
    const prisma = {
      video: { findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(new ProcessingJobsService(prisma, {} as LocalStorageService).create({ videoId: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds annotatedVideoAvailable from one grouped query for the job list', async () => {
    const rows = [
      { id: 'job-with-video', video: { id: 'video-1' } },
      { id: 'job-without-video', video: { id: 'video-2' } },
    ];
    const groupBy = jest.fn<() => Promise<{ jobId: string | null }[]>>().mockResolvedValue([{ jobId: 'job-with-video' }]);
    const prisma = {
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      processingJob: {
        findMany: jest.fn<() => Promise<typeof rows>>().mockResolvedValue(rows),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(2),
      },
      evidenceAsset: { groupBy },
    } as unknown as PrismaService;
    const service = new ProcessingJobsService(prisma, {} as LocalStorageService);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.data.map((job) => job.annotatedVideoAvailable)).toEqual([true, false]);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['jobId'],
      where: {
        jobId: { in: ['job-with-video', 'job-without-video'] },
        eventId: null,
        assetType: EvidenceAssetType.ANNOTATED_VIDEO,
      },
    });
  });

  it('adds annotatedVideoAvailable to job detail', async () => {
    const job = { id: 'job-with-video', video: { id: 'video-1' }, _count: { events: 1 } };
    const prisma = {
      processingJob: { findUnique: jest.fn<() => Promise<typeof job>>().mockResolvedValue(job) },
      evidenceAsset: { groupBy: jest.fn<() => Promise<{ jobId: string | null }[]>>().mockResolvedValue([{ jobId: job.id }]) },
    } as unknown as PrismaService;

    await expect(new ProcessingJobsService(prisma, {} as LocalStorageService).findOne(job.id))
      .resolves.toMatchObject({ annotatedVideoAvailable: true });
  });
});
