import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { EvidenceAssetType, ProcessingJobStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { EVENT_ID, JOB_ID, makeAiResult } from '../../test/fixtures/ai-result.fixture';
import { AiResultImportService } from './ai-result-import.service';

function createTransactionMock() {
  return {
    processingJob: { update: jest.fn<() => Promise<{ id: string; status: ProcessingJobStatus; _count: { events: number } }>>()
      .mockResolvedValue({ id: JOB_ID, status: ProcessingJobStatus.COMPLETED, _count: { events: 1 } }) },
    detectionEvent: { upsert: jest.fn<() => Promise<{ id: string }>>()
      .mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' }) },
    evidenceAsset: { upsert: jest.fn<() => Promise<Record<string, never>>>().mockResolvedValue({}) },
    video: { update: jest.fn<() => Promise<Record<string, never>>>().mockResolvedValue({}) },
  };
}

function createDependencies(transactionShouldFail = false) {
  const tx = createTransactionMock();
  const prisma = {
    processingJob: {
      findUnique: jest.fn<() => Promise<{ id: string; videoId: string; status: ProcessingJobStatus; _count: { events: number } }>>().mockResolvedValue({
        id: JOB_ID,
        videoId: '55555555-5555-4555-8555-555555555555',
        status: ProcessingJobStatus.PENDING,
        _count: { events: 0 },
      }),
    },
    $transaction: jest.fn<(callback: (client: typeof tx) => Promise<unknown>) => Promise<unknown>>()
      .mockImplementation(async (callback) => {
      if (transactionShouldFail) throw new Error('database failed');
      return callback(tx);
      }),
  } as unknown as PrismaService;
  const storage = {
    copyTrustedArtifact: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    delete: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as LocalStorageService;
  return { prisma, storage, tx };
}

describe('AiResultImportService', () => {
  it('dùng upsert để import lặp không tạo duplicate event', async () => {
    const { prisma, storage, tx } = createDependencies();
    const service = new AiResultImportService(prisma, storage);
    await service.import(JOB_ID, makeAiResult(), '/trusted/results');
    await service.import(JOB_ID, makeAiResult(), '/trusted/results');
    expect(tx.detectionEvent.upsert).toHaveBeenCalledTimes(2);
    expect(tx.detectionEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { jobId_sourceEventId: { jobId: JOB_ID, sourceEventId: EVENT_ID } },
    }));
  });

  it('cleanup evidence khi database transaction rollback', async () => {
    const { prisma, storage } = createDependencies(true);
    const service = new AiResultImportService(prisma, storage);
    await expect(service.import(JOB_ID, makeAiResult(), '/trusted/results')).rejects.toThrow('database failed');
    expect(storage.delete).toHaveBeenCalledWith(`evidence/${JOB_ID}/${EVENT_ID}.jpg`);
  });

  it('copy và upsert plate crop với storage key và asset type riêng', async () => {
    const { prisma, storage, tx } = createDependencies();
    const service = new AiResultImportService(prisma, storage);
    const payload = makeAiResult();
    payload.schema_version = '1.1';
    payload.summary.schema_version = '1.1';
    payload.events[0].schema_version = '1.1';
    Object.assign(payload.events[0], { plate_crop_path: 'evidence/plate.png' });

    await service.import(JOB_ID, payload, '/trusted/results');

    expect(storage.copyTrustedArtifact).toHaveBeenCalledWith(
      '/trusted/results', 'evidence/plate.png', `evidence/${JOB_ID}/${EVENT_ID}-plate.png`,
    );
    expect(tx.evidenceAsset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { storageKey: `evidence/${JOB_ID}/${EVENT_ID}-plate.png` },
      create: expect.objectContaining({
        eventId: '44444444-4444-4444-8444-444444444444',
        assetType: EvidenceAssetType.PLATE_CROP,
        mimeType: 'image/png',
      }),
    }));
  });

  it('cleanup cả ảnh toàn cảnh và plate crop nếu transaction lỗi', async () => {
    const { prisma, storage } = createDependencies(true);
    const payload = makeAiResult();
    payload.schema_version = '1.1';
    payload.summary.schema_version = '1.1';
    payload.events[0].schema_version = '1.1';
    Object.assign(payload.events[0], { plate_crop_path: 'evidence/plate.jpg' });
    const service = new AiResultImportService(prisma, storage);

    await expect(service.import(JOB_ID, payload, '/trusted/results')).rejects.toThrow('database failed');

    expect(storage.delete).toHaveBeenCalledWith(`evidence/${JOB_ID}/${EVENT_ID}.jpg`);
    expect(storage.delete).toHaveBeenCalledWith(`evidence/${JOB_ID}/${EVENT_ID}-plate.jpg`);
  });

  it('từ chối job không tồn tại', async () => {
    const prisma = {
      processingJob: { findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const storage = {} as LocalStorageService;
    await expect(new AiResultImportService(prisma, storage).import(JOB_ID, makeAiResult(), '/trusted')).rejects.toBeInstanceOf(NotFoundException);
  });
});
