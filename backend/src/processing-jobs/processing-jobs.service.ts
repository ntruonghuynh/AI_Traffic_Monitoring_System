import { Injectable, NotFoundException } from '@nestjs/common';
import { ProcessingJobStatus } from '../generated/prisma/client';
import { paginate } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobQueryDto } from './dto/job-query.dto';

@Injectable()
export class ProcessingJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateJobDto) {
    const video = await this.prisma.video.findUnique({ where: { id: dto.videoId }, select: { id: true } });
    if (!video) throw new NotFoundException('Không tìm thấy video');
    return this.prisma.processingJob.create({
      data: { videoId: dto.videoId, status: ProcessingJobStatus.PENDING },
    });
  }

  async findAll(query: JobQueryDto) {
    const where = { status: query.status, videoId: query.videoId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.processingJob.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { video: { select: { id: true, originalFilename: true } } },
      }),
      this.prisma.processingJob.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const job = await this.prisma.processingJob.findUnique({
      where: { id },
      include: { video: { select: { id: true, originalFilename: true } }, _count: { select: { events: true } } },
    });
    if (!job) throw new NotFoundException('Không tìm thấy processing job');
    return job;
  }

  async findEvents(id: string) {
    await this.findOne(id);
    return this.prisma.detectionEvent.findMany({
      where: { jobId: id },
      orderBy: [{ frameIndex: 'asc' }, { sourceEventId: 'asc' }],
      include: { evidenceAssets: { select: { id: true, assetType: true, mimeType: true, createdAt: true } } },
    });
  }
}
