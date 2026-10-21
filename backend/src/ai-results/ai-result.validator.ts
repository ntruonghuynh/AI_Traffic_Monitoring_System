import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { extname } from 'node:path';
import { assertSafeRelativePath } from '../common/utils/path-security';
import { AiProcessingResultDto, AiProcessingStatus } from './dto/ai-result.dto';

export async function validateAiResult(payload: unknown): Promise<AiProcessingResultDto> {
  const instance = plainToInstance(AiProcessingResultDto, payload);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
  });
  if (errors.length > 0) {
    throw new BadRequestException({ message: 'AI result JSON không hợp lệ', details: errors });
  }

  if (instance.schema_version !== instance.summary.schema_version) {
    throw new BadRequestException('schema_version không đồng nhất giữa root và summary');
  }
  if (!['1.0', '1.1', '1.2'].includes(instance.schema_version)) {
    throw new BadRequestException(`Không hỗ trợ AI schema ${instance.schema_version}`);
  }
  if (instance.summary.status === AiProcessingStatus.Running) {
    throw new BadRequestException('Không thể import kết quả AI còn ở trạng thái RUNNING');
  }
  if (instance.summary.total_candidate_events !== instance.events.length) {
    throw new BadRequestException('total_candidate_events không khớp số event');
  }
  if (instance.summary.processed_frames === 0 && instance.events.length > 0) {
    throw new BadRequestException('Không thể có event khi processed_frames bằng 0');
  }
  if (instance.summary.status === AiProcessingStatus.Completed && !instance.summary.finished_at) {
    throw new BadRequestException('Kết quả COMPLETED phải có finished_at');
  }
  if (instance.summary.status === AiProcessingStatus.Completed && instance.summary.error !== null) {
    throw new BadRequestException('Kết quả COMPLETED không được chứa error');
  }
  if (instance.summary.status === AiProcessingStatus.Failed && !instance.summary.error?.trim()) {
    throw new BadRequestException('Kết quả FAILED phải mô tả error');
  }

  const sourceEvents = payload && typeof payload === 'object' && 'events' in payload && Array.isArray(payload.events)
    ? payload.events
    : [];
  const ids = new Set<string>();
  for (const [index, event] of instance.events.entries()) {
    if (event.schema_version !== instance.schema_version) {
      throw new BadRequestException(`Event ${event.event_id} có schema_version không đồng nhất`);
    }
    const sourceEvent: unknown = sourceEvents[index];
    const hasPlateCropField = sourceEvent !== null
      && typeof sourceEvent === 'object'
      && Object.prototype.hasOwnProperty.call(sourceEvent, 'plate_crop_path');
    const hasPlateCropReasonField = sourceEvent !== null
      && typeof sourceEvent === 'object'
      && Object.prototype.hasOwnProperty.call(sourceEvent, 'plate_crop_reason');
    if (instance.schema_version === '1.0' && hasPlateCropField) {
      throw new BadRequestException('plate_crop_path chỉ được phép từ AI schema 1.1 trở lên');
    }
    if (hasPlateCropReasonField && instance.schema_version !== '1.2') {
      throw new BadRequestException('plate_crop_reason chỉ được phép trong AI schema 1.2');
    }
    if (hasPlateCropReasonField && sourceEvent && typeof sourceEvent === 'object'
      && (sourceEvent as Record<string, unknown>).plate_crop_reason === null) {
      throw new BadRequestException('plate_crop_reason phải là một trong các giá trị hỗ trợ');
    }
    if (event.plate_crop_reason && event.plate_crop_path !== null) {
      throw new BadRequestException('plate_crop_reason chỉ được dùng khi plate_crop_path là null');
    }
    if (ids.has(event.event_id)) throw new BadRequestException(`Trùng event_id trong payload: ${event.event_id}`);
    ids.add(event.event_id);
    if (event.frame_index >= instance.summary.processed_frames) {
      throw new BadRequestException(`frame_index của event ${event.event_id} nằm ngoài số frame đã xử lý`);
    }
    const maximumTimestamp = instance.summary.processed_frames / instance.summary.input_video.fps;
    if (event.timestamp_seconds > maximumTimestamp + Number.EPSILON) {
      throw new BadRequestException(`timestamp_seconds của event ${event.event_id} nằm ngoài video đã xử lý`);
    }
    if (event.evidence_path) assertSafeRelativePath(event.evidence_path);
    if (event.plate_crop_path !== null && event.plate_crop_path !== undefined) {
      assertSafeRelativePath(event.plate_crop_path);
      if (!['.jpg', '.jpeg', '.png'].includes(extname(event.plate_crop_path).toLowerCase())) {
        throw new BadRequestException(`Plate crop của event ${event.event_id} không phải ảnh được hỗ trợ`);
      }
    }
  }
  assertSafeRelativePath(instance.summary.artifacts.result_json);
  if (instance.summary.artifacts.annotated_video) assertSafeRelativePath(instance.summary.artifacts.annotated_video);
  if (instance.summary.artifacts.legacy_csv) assertSafeRelativePath(instance.summary.artifacts.legacy_csv);
  if (instance.summary.artifacts.legacy_sqlite) assertSafeRelativePath(instance.summary.artifacts.legacy_sqlite);
  return instance;
}
