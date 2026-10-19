import { BadRequestException, Injectable } from '@nestjs/common';
import { CameraStatus, Prisma, ProcessingJobStatus, ReviewStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventStatsGroupBy, EventStatsQueryDto } from './dto/event-stats-query.dto';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [cameraTotal, cameraGroups, videoTotal, jobTotal, jobGroups, eventTotal, eventGroups] = await this.prisma.$transaction([
      this.prisma.camera.count(),
      this.prisma.camera.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.video.count(),
      this.prisma.processingJob.count(),
      this.prisma.processingJob.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.detectionEvent.count(),
      this.prisma.detectionEvent.groupBy({ by: ['reviewStatus'], _count: { _all: true } }),
    ]);

    const counts = (
      groups: { status?: string; reviewStatus?: string; _count: { _all: number } }[],
      field: 'status' | 'reviewStatus',
      values: readonly string[],
    ) => Object.fromEntries(values.map((value) => [
      value,
      groups.find((group) => group[field] === value)?._count._all ?? 0,
    ]));

    return {
      cameras: { total: cameraTotal, byStatus: counts(cameraGroups, 'status', Object.values(CameraStatus)) },
      videos: { total: videoTotal },
      jobs: { total: jobTotal, byStatus: counts(jobGroups, 'status', Object.values(ProcessingJobStatus)) },
      events: { total: eventTotal, byReviewStatus: counts(eventGroups, 'reviewStatus', Object.values(ReviewStatus)) },
    };
  }

  async eventGroups(query: EventStatsQueryDto) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (from > to) throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');

    const keyExpression = this.groupKeyExpression(query.groupBy);
    const rows = await this.prisma.$queryRaw<Array<{ key: string | null; count: bigint }>>(Prisma.sql`
      SELECT ${keyExpression} AS "key", COUNT(*) AS "count"
      FROM "DetectionEvent"
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY ${keyExpression}
      ORDER BY ${keyExpression} ASC
    `);

    return {
      groupBy: query.groupBy,
      items: rows.map((row) => ({ key: row.key, count: Number(row.count) })),
    };
  }

  private groupKeyExpression(groupBy: EventStatsGroupBy): Prisma.Sql {
    switch (groupBy) {
      case EventStatsGroupBy.Day:
        return Prisma.sql`to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
      case EventStatsGroupBy.VehicleType:
        return Prisma.sql`"vehicleType"`;
      case EventStatsGroupBy.ReviewStatus:
        return Prisma.sql`"reviewStatus"`;
    }
  }
}
