import { jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service';
import { EventStatsGroupBy } from './dto/event-stats-query.dto';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  it('returns totals and zero-filled status buckets', async () => {
    const txResults = [
      Promise.resolve(2),
      Promise.resolve([{ status: 'ACTIVE', _count: { _all: 2 } }]),
      Promise.resolve(3),
      Promise.resolve(4),
      Promise.resolve([{ status: 'PENDING', _count: { _all: 1 } }]),
      Promise.resolve(5),
      Promise.resolve([{ reviewStatus: 'PENDING_REVIEW', _count: { _all: 4 } }]),
    ];
    const prisma = {
      $transaction: jest.fn(async () => Promise.all(txResults)),
      camera: { count: jest.fn(), groupBy: jest.fn() },
      video: { count: jest.fn() },
      processingJob: { count: jest.fn(), groupBy: jest.fn() },
      detectionEvent: { count: jest.fn(), groupBy: jest.fn() },
    } as unknown as PrismaService;

    await expect(new StatsService(prisma).overview()).resolves.toEqual({
      cameras: { total: 2, byStatus: { ACTIVE: 2, INACTIVE: 0, MAINTENANCE: 0 } },
      videos: { total: 3 },
      jobs: { total: 4, byStatus: { PENDING: 1, PROCESSING: 0, COMPLETED: 0, FAILED: 0 } },
      events: { total: 5, byReviewStatus: { PENDING_REVIEW: 4, VERIFIED_CROSSING: 0, REJECTED_CANDIDATE: 0 } },
    });
  });

  it('returns groups and converts database bigint counts to numbers', async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.resolve([{ key: '2040-01-02', count: 7n }])),
    } as unknown as PrismaService;
    const service = new StatsService(prisma);

    await expect(service.eventGroups({ groupBy: EventStatsGroupBy.Day })).resolves.toEqual({
      groupBy: 'day',
      items: [{ key: '2040-01-02', count: 7 }],
    });
  });

  it('rejects a reversed date range', async () => {
    const prisma = { $queryRaw: jest.fn() } as unknown as PrismaService;
    const service = new StatsService(prisma);

    await expect(service.eventGroups({
      groupBy: EventStatsGroupBy.Day,
      from: '2040-02-02T00:00:00Z',
      to: '2040-02-01T00:00:00Z',
    })).rejects.toThrow('from phải nhỏ hơn hoặc bằng to');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
