import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { extname } from 'node:path';
import {
  DetectionEventType,
  EvidenceAssetType,
  Prisma,
  ProcessingJobStatus,
  ReviewStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { safeError } from '../common/utils/safe-error';
import { assertJobTransition } from '../processing-jobs/job-state';
import { AiEventDto, AiProcessingStatus } from './dto/ai-result.dto';
import { validateAiResult } from './ai-result.validator';

interface CopiedArtifact {
  storageKey: string;
  mimeType: string;
  assetType: EvidenceAssetType;
  newlyCopied: boolean;
}

@Injectable()
export class AiResultImportService {
  constructor(private readonly prisma: PrismaService, private readonly storage: LocalStorageService) {}

  async import(jobId: string, payload: unknown, trustedResultRoot: string) {
    const result = await validateAiResult(payload);
    if (result.summary.job_id !== jobId) {
      throw new BadRequestException('summary.job_id không trùng --job-id');
    }
    const job = await this.prisma.processingJob.findUnique({
      where: { id: jobId },
      include: { _count: { select: { events: true } } },
    });
    if (!job) throw new NotFoundException('Không tìm thấy processing job');

    const finalStatus = result.summary.status === AiProcessingStatus.Completed
      ? ProcessingJobStatus.COMPLETED
      : ProcessingJobStatus.FAILED;
    if (job.status === ProcessingJobStatus.COMPLETED && finalStatus !== ProcessingJobStatus.COMPLETED) {
      throw new ConflictException('Không thể ghi đè job COMPLETED bằng kết quả FAILED');
    }
    if (job.status !== ProcessingJobStatus.COMPLETED) {
      if (finalStatus === ProcessingJobStatus.COMPLETED && job.status === ProcessingJobStatus.PENDING) {
        assertJobTransition(job.status, ProcessingJobStatus.PROCESSING);
      } else {
        assertJobTransition(job.status, finalStatus);
      }
    }

    const copied: CopiedArtifact[] = [];
    try {
      const eventArtifacts = new Map<string, CopiedArtifact[]>();
      for (const event of result.events) {
        const artifacts: CopiedArtifact[] = [];
        if (event.evidence_path) artifacts.push(await this.copyEventEvidence(jobId, event, trustedResultRoot));
        if (event.plate_crop_path) artifacts.push(await this.copyPlateCrop(jobId, event, trustedResultRoot));
        if (artifacts.length > 0) {
          eventArtifacts.set(event.event_id, artifacts);
          copied.push(...artifacts);
        }
      }

      let annotatedArtifact: { storageKey: string; mimeType: string; newlyCopied: boolean } | null = null;
      if (result.summary.artifacts.annotated_video) {
        if (extname(result.summary.artifacts.annotated_video).toLowerCase() !== '.mp4') {
          throw new BadRequestException('Annotated video phải có định dạng .mp4');
        }
        const storageKey = `evidence/${jobId}/annotated-video.mp4`;
        const newlyCopied = await this.storage.copyTrustedArtifact(
          trustedResultRoot,
          result.summary.artifacts.annotated_video,
          storageKey,
        );
        annotatedArtifact = { storageKey, mimeType: 'video/mp4', newlyCopied };
        copied.push({ storageKey, mimeType: 'video/mp4', assetType: EvidenceAssetType.ANNOTATED_VIDEO, newlyCopied });
      }

      return await this.prisma.$transaction(async (tx) => {
        if (job.status === ProcessingJobStatus.PENDING && finalStatus === ProcessingJobStatus.COMPLETED) {
          await tx.processingJob.update({ where: { id: jobId }, data: { status: ProcessingJobStatus.PROCESSING } });
        }

        for (const event of result.events) {
          const data = this.eventData(event);
          const storedEvent = await tx.detectionEvent.upsert({
            where: { jobId_sourceEventId: { jobId, sourceEventId: event.event_id } },
            create: {
              jobId,
              reviewStatus: ReviewStatus.PENDING_REVIEW,
              ...data,
            },
            update: data,
          });
          for (const artifact of eventArtifacts.get(event.event_id) ?? []) {
            await tx.evidenceAsset.upsert({
              where: { storageKey: artifact.storageKey },
              create: {
                eventId: storedEvent.id,
                assetType: artifact.assetType,
                storageKey: artifact.storageKey,
                mimeType: artifact.mimeType,
              },
              update: {
                eventId: storedEvent.id,
                jobId: null,
                assetType: artifact.assetType,
                mimeType: artifact.mimeType,
              },
            });
          }
        }

        if (annotatedArtifact) {
          await tx.evidenceAsset.upsert({
            where: { storageKey: annotatedArtifact.storageKey },
            create: {
              jobId,
              assetType: EvidenceAssetType.ANNOTATED_VIDEO,
              storageKey: annotatedArtifact.storageKey,
              mimeType: annotatedArtifact.mimeType,
            },
            update: { jobId, eventId: null, mimeType: annotatedArtifact.mimeType },
          });
        }

        await tx.video.update({
          where: { id: job.videoId },
          data: {
            width: result.summary.input_video.width,
            height: result.summary.input_video.height,
            durationSeconds: result.summary.input_video.duration_seconds,
          },
        });
        return tx.processingJob.update({
          where: { id: jobId },
          data: {
            status: finalStatus,
            aiSchemaVersion: result.schema_version,
            startedAt: new Date(result.summary.started_at),
            completedAt: result.summary.finished_at ? new Date(result.summary.finished_at) : null,
            totalFrames: result.summary.input_video.reported_total_frames,
            processedFrames: result.summary.processed_frames,
            totalEvents: result.events.length,
            errorMessage: result.summary.error ? safeError(result.summary.error) : null,
          },
          include: { _count: { select: { events: true } } },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await Promise.allSettled(
        copied.filter((item) => item.newlyCopied).map((item) => this.storage.delete(item.storageKey)),
      );
      throw error;
    }
  }

  private eventData(event: AiEventDto): Prisma.DetectionEventUncheckedCreateWithoutJobInput {
    return {
      sourceEventId: event.event_id,
      eventType: DetectionEventType.LINE_CROSSING_CANDIDATE,
      trackId: event.track_id,
      vehicleType: event.vehicle_type,
      confidence: event.confidence,
      plateNumber: event.plate_number,
      plateRawText: event.plate_raw_text,
      plateConfidence: event.plate_confidence,
      frameIndex: event.frame_index,
      timestampSeconds: event.timestamp_seconds,
      crossingDirection: event.crossing_direction,
      detectedAt: null,
      rawPayload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
    };
  }

  private async copyEventEvidence(jobId: string, event: AiEventDto, sourceRoot: string) {
    const extension = extname(event.evidence_path!).toLowerCase();
    const mimeType = extension === '.png' ? 'image/png' : 'image/jpeg';
    if (!['.jpg', '.jpeg', '.png'].includes(extension)) {
      throw new BadRequestException(`Evidence của event ${event.event_id} không phải ảnh được hỗ trợ`);
    }
    const storageKey = `evidence/${jobId}/${event.event_id}${extension}`;
    const newlyCopied = await this.storage.copyTrustedArtifact(sourceRoot, event.evidence_path!, storageKey);
    return { storageKey, mimeType, assetType: EvidenceAssetType.IMAGE, newlyCopied };
  }

  private async copyPlateCrop(jobId: string, event: AiEventDto, sourceRoot: string): Promise<CopiedArtifact> {
    const extension = extname(event.plate_crop_path!).toLowerCase();
    const mimeType = extension === '.png' ? 'image/png' : 'image/jpeg';
    const storageKey = `evidence/${jobId}/${event.event_id}-plate${extension}`;
    const newlyCopied = await this.storage.copyTrustedArtifact(sourceRoot, event.plate_crop_path!, storageKey);
    return { storageKey, mimeType, assetType: EvidenceAssetType.PLATE_CROP, newlyCopied };
  }
}
