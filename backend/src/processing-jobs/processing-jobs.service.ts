import { Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceAssetType, ProcessingJobStatus } from '../generated/prisma/client';
import { BadRequestException } from '@nestjs/common';
import { paginate } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { prepareStreamContent, StreamContent } from '../storage/stream-content';
import { CreateJobDto } from './dto/create-job.dto';
import { JobQueryDto } from './dto/job-query.dto';

@Injectable()
export class ProcessingJobsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: LocalStorageService) {}

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
    const availableJobIds = await this.annotatedVideoJobIds(data.map((job) => job.id));
    return paginate(
      data.map((job) => ({ ...job, annotatedVideoAvailable: availableJobIds.has(job.id) })),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string) {
    const job = await this.prisma.processingJob.findUnique({
      where: { id },
      include: { video: { select: { id: true, originalFilename: true } }, _count: { select: { events: true } } },
    });
    if (!job) throw new NotFoundException('Không tìm thấy processing job');
    const availableJobIds = await this.annotatedVideoJobIds([job.id]);
    return { ...job, annotatedVideoAvailable: availableJobIds.has(job.id) };
  }

  async annotatedVideoContent(id: string, rangeHeader?: string): Promise<StreamContent> {
    const job = await this.prisma.processingJob.findUnique({ where: { id }, select: { id: true } });
    if (!job) throw new NotFoundException('Không tìm thấy processing job');

    const asset = await this.prisma.evidenceAsset.findFirst({
      where: { jobId: id, eventId: null, assetType: EvidenceAssetType.ANNOTATED_VIDEO },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { storageKey: true },
    });
    if (!asset) throw new NotFoundException('Job không có video chú thích');

    try {
      const storedFile = await this.storage.openStreamFile(asset.storageKey);
      return prepareStreamContent(storedFile, 'video/mp4', rangeHeader);
    } catch (error) {
      if (error instanceof BadRequestException) throw new NotFoundException('Không tìm thấy video chú thích');
      throw error;
    }
  }

  async findEvents(id: string) {
    await this.findOne(id);
    return this.prisma.detectionEvent.findMany({
      where: { jobId: id },
      orderBy: [{ frameIndex: 'asc' }, { sourceEventId: 'asc' }],
      include: { evidenceAssets: { select: { id: true, assetType: true, mimeType: true, createdAt: true } } },
    });
  }

  private async annotatedVideoJobIds(jobIds: string[]): Promise<Set<string>> {
    if (jobIds.length === 0) return new Set();
    const rows = await this.prisma.evidenceAsset.groupBy({
      by: ['jobId'],
      where: {
        jobId: { in: jobIds },
        eventId: null,
        assetType: EvidenceAssetType.ANNOTATED_VIDEO,
      },
    });
    return new Set(rows.flatMap(({ jobId }) => jobId ? [jobId] : []));
  }
}
