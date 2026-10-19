import { jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service';
import { DetectionEventsService } from './detection-events.service';

describe('DetectionEventsService', () => {
  it('áp dụng filter và stable sorting khi query', async () => {
    const findMany = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
    const count = jest.fn<() => Promise<number>>().mockResolvedValue(0);
    const prisma = {
      detectionEvent: { findMany, count },
      $transaction: jest.fn<() => Promise<[unknown[], number]>>().mockResolvedValue([[], 0]),
    } as unknown as PrismaService;
    const service = new DetectionEventsService(prisma);
    await service.findAll({ page: 1, limit: 20, plateNumber: '59A1', vehicleType: 'motorcycle' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: expect.objectContaining({ vehicleType: 'motorcycle' }),
    }));
    expect(count).toHaveBeenCalled();
  });
});
