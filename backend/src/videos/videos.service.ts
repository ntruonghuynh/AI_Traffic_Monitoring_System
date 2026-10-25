import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ReadStream } from 'node:fs';
import { basename } from 'node:path';
import { paginate } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService, StorageByteRange } from '../storage/local-storage.service';
import { UploadVideoDto } from './dto/upload-video.dto';
import { VideoQueryDto } from './dto/video-query.dto';
import { validateVideoFile } from './video-validation';

interface ParsedByteRange { range: StorageByteRange | null; unsatisfiable: boolean }

export interface VideoContent {
  stream: ReadStream | null;
  statusCode: 200 | 206 | 416;
  contentType: string;
  contentLength: number;
  contentRange?: string;
}

export function parseByteRange(header: string, size: number): ParsedByteRange {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return { range: null, unsatisfiable: true };

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { range: null, unsatisfiable: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
      return { range: null, unsatisfiable: true };
    }
    end = Math.min(end, size - 1);
  }
  return { range: { start, end }, unsatisfiable: false };
}

@Injectable()
export class VideosService {
  private readonly maxUploadSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
    config: ConfigService,
  ) {
    this.maxUploadSize = config.getOrThrow<number>('MAX_UPLOAD_SIZE');
  }

  async upload(file: Express.Multer.File, dto: UploadVideoDto) {
    const extension = validateVideoFile(file, this.maxUploadSize);
    if (dto.cameraId) {
      const camera = await this.prisma.camera.findUnique({ where: { id: dto.cameraId }, select: { id: true } });
      if (!camera) throw new NotFoundException('Không tìm thấy camera');
    }
    const storageKey = await this.storage.saveVideo(file.buffer, extension);
    try {
      const video = await this.prisma.video.create({
        data: {
          cameraId: dto.cameraId,
          originalFilename: this.safeOriginalName(file.originalname),
          storageKey,
          mimeType: file.mimetype,
          fileSize: BigInt(file.size),
        },
      });
      return this.present(video);
    } catch (error) {
      await this.storage.delete(storageKey);
      throw error;
    }
  }

  async findAll(query: VideoQueryDto) {
    const where = { cameraId: query.cameraId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.video.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
        include: { camera: { select: { id: true, name: true } }, _count: { select: { processingJobs: true } } },
      }),
      this.prisma.video.count({ where }),
    ]);
    return paginate(rows.map((row) => this.present(row)), total, query.page, query.limit);
  }

  async findOne(id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: { camera: { select: { id: true, name: true } }, _count: { select: { processingJobs: true } } },
    });
    if (!video) throw new NotFoundException('Không tìm thấy video');
    return this.present(video);
  }

  async content(id: string, rangeHeader?: string): Promise<VideoContent> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: { id: true, storageKey: true, mimeType: true },
    });
    if (!video) throw new NotFoundException('Không tìm thấy video');

    let storedFile;
    try {
      storedFile = await this.storage.openStreamFile(video.storageKey);
    } catch (error) {
      if (error instanceof BadRequestException) throw new NotFoundException('Không tìm thấy video');
      throw error;
    }

    const contentType = this.safeVideoMimeType(video.mimeType);
    if (rangeHeader) {
      const parsed = parseByteRange(rangeHeader, storedFile.size);
      if (parsed.unsatisfiable || !parsed.range) {
        return {
          stream: null,
          statusCode: 416,
          contentType,
          contentLength: 0,
          contentRange: `bytes */${storedFile.size}`,
        };
      }
      return {
        stream: storedFile.createReadStream(parsed.range),
        statusCode: 206,
        contentType,
        contentLength: parsed.range.end - parsed.range.start + 1,
        contentRange: `bytes ${parsed.range.start}-${parsed.range.end}/${storedFile.size}`,
      };
    }

    return {
      stream: storedFile.createReadStream(),
      statusCode: 200,
      contentType,
      contentLength: storedFile.size,
    };
  }

  async findJobs(id: string) {
    await this.findOne(id);
    return this.prisma.processingJob.findMany({
      where: { videoId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async remove(id: string): Promise<void> {
    const video = await this.prisma.video.findUnique({
      where: { id },
      include: { _count: { select: { processingJobs: true } } },
    });
    if (!video) throw new NotFoundException('Không tìm thấy video');
    if (video._count.processingJobs > 0) {
      throw new ConflictException('Không thể xóa video đã có processing job');
    }
    await this.prisma.video.delete({ where: { id } });
    await this.storage.delete(video.storageKey);
  }

  private present<T extends { fileSize: bigint; storageKey: string }>(video: T) {
    const { storageKey: _storageKey, ...publicVideo } = video;
    void _storageKey;
    return { ...publicVideo, fileSize: video.fileSize.toString() };
  }

  private safeOriginalName(value: string): string {
    const sanitized = [...basename(value).normalize('NFKC')]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join('');
    return sanitized.slice(0, 255) || 'video';
  }

  private safeVideoMimeType(value: string | null | undefined): string {
    const mimeType = value?.trim();
    return mimeType && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType)
      ? mimeType
      : 'video/mp4';
  }
}
