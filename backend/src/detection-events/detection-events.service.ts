import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewStatus } from '../generated/prisma/client';
import { paginate } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { EventQueryDto } from './dto/event-query.dto';
import { ReviewEventDto } from './dto/review-event.dto';

@Injectable()
export class DetectionEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: EventQueryDto) {
    const where: Prisma.DetectionEventWhereInput = {
      jobId: query.jobId,
      job: query.videoId ? { videoId: query.videoId } : undefined,
      eventType: query.eventType,
      reviewStatus: query.reviewStatus,
      vehicleType: query.vehicleType,
      plateNumber: query.plateNumber ? { contains: query.plateNumber, mode: 'insensitive' } : undefined,
      createdAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
      timestampSeconds: query.minTimestampSeconds === undefined ? undefined : { gte: query.minTimestampSeconds },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.detectionEvent.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          job: { select: { id: true, videoId: true } },
          evidenceAssets: { select: { id: true, assetType: true, mimeType: true, createdAt: true } },
        },
      }),
      this.prisma.detectionEvent.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const event = await this.prisma.detectionEvent.findUnique({
      where: { id },
      include: { job: { select: { id: true, videoId: true } }, evidenceAssets: true },
    });
    if (!event) throw new NotFoundException('Không tìm thấy detection event');
    return event;
  }

  async findEvidence(id: string) {
    await this.findOne(id);
    return this.prisma.evidenceAsset.findMany({
      where: { eventId: id },
      select: { id: true, assetType: true, mimeType: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async review(id: string, dto: ReviewEventDto) {
    if (dto.reviewStatus === ReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException('Review mutation chỉ chấp nhận VERIFIED_CROSSING hoặc REJECTED_CANDIDATE');
    }
    await this.findOne(id);
    const event = await this.prisma.detectionEvent.update({
      where: { id },
      data: {
        reviewStatus: dto.reviewStatus,
        reviewNote: dto.note?.trim() || null,
        reviewedAt: new Date(),
      },
    });
    return {
      ...event,
      warning: 'VERIFIED_CROSSING không đồng nghĩa xác nhận vi phạm đèn đỏ hợp pháp',
    };
  }
}
