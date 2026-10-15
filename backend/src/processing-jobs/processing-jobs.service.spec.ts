import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ProcessingJobStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessingJobsService } from './processing-jobs.service';

describe('ProcessingJobsService', () => {
  it('tạo job ở trạng thái PENDING cho video tồn tại', async () => {
    const create = jest.fn<() => Promise<{ id: string; status: ProcessingJobStatus }>>()
      .mockResolvedValue({ id: 'job-id', status: ProcessingJobStatus.PENDING });
    const prisma = {
      video: { findUnique: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'video-id' }) },
      processingJob: { create },
    } as unknown as PrismaService;
    const service = new ProcessingJobsService(prisma);
    await expect(service.create({ videoId: 'video-id' })).resolves.toMatchObject({ status: ProcessingJobStatus.PENDING });
  });

  it('từ chối video không tồn tại', async () => {
    const prisma = {
      video: { findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(new ProcessingJobsService(prisma).create({ videoId: 'missing' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
