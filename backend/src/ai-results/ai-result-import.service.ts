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
      const eventArtifacts = new Map<string, { storageKey: string; mimeType: string }>();
      for (const event of result.events) {
        if (!event.evidence_path) continue;
        const artifact = await this.copyEventEvidence(jobId, event, trustedResultRoot);
        eventArtifacts.set(event.event_id, artifact);
        copied.push({ storageKey: artifact.storageKey, newlyCopied: artifact.newlyCopied });
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
        copied.push({ storageKey, newlyCopied });
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
          const artifact = eventArtifacts.get(event.event_id);
          if (artifact) {
            await tx.evidenceAsset.upsert({
              where: { storageKey: artifact.storageKey },
              create: {
                eventId: storedEvent.id,
                assetType: EvidenceAssetType.IMAGE,
                storageKey: artifact.storageKey,
                mimeType: artifact.mimeType,
              },
              update: { eventId: storedEvent.id, jobId: null, mimeType: artifact.mimeType },
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
    return { storageKey, mimeType, newlyCopied };
  }
}
