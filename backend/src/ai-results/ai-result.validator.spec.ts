import { BadRequestException } from '@nestjs/common';
import { makeAiResult } from '../../test/fixtures/ai-result.fixture';
import { validateAiResult } from './ai-result.validator';

describe('validateAiResult', () => {
  it('chấp nhận OCR nullable đúng contract Phase 01', async () => {
    const result = await validateAiResult(makeAiResult());
    expect(result.events[0].plate_number).toBeNull();
    expect(result.events[0].plate_confidence).toBeNull();
  });

  it('chấp nhận schema 1.0 không có plate crop và schema 1.1 có plate crop', async () => {
    await expect(validateAiResult(makeAiResult())).resolves.toMatchObject({ schema_version: '1.0' });

    const payload = makeAiResult();
    payload.schema_version = '1.1';
    payload.summary.schema_version = '1.1';
    payload.events[0].schema_version = '1.1';
    Object.assign(payload.events[0], { plate_crop_path: 'evidence/plate.jpg' });
    await expect(validateAiResult(payload)).resolves.toMatchObject({
      schema_version: '1.1',
      events: [expect.objectContaining({ plate_crop_path: 'evidence/plate.jpg' })],
    });
  });

  it('chấp nhận plate_crop_reason hợp lệ ở schema 1.2 và giữ trường này trong event DTO', async () => {
    const payload = makeAiResult();
    payload.schema_version = '1.2';
    payload.summary.schema_version = '1.2';
    payload.events[0].schema_version = '1.2';
    Object.assign(payload.events[0], { plate_crop_path: null, plate_crop_reason: 'TOO_SMALL' });

    await expect(validateAiResult(payload)).resolves.toMatchObject({
      schema_version: '1.2',
      events: [expect.objectContaining({ plate_crop_path: null, plate_crop_reason: 'TOO_SMALL' })],
    });
  });

  it('từ chối plate_crop_reason không hỗ trợ hoặc đi cùng crop đã lưu', async () => {
    const invalidReason = makeAiResult();
    invalidReason.schema_version = '1.2';
    invalidReason.summary.schema_version = '1.2';
    invalidReason.events[0].schema_version = '1.2';
    Object.assign(invalidReason.events[0], { plate_crop_path: null, plate_crop_reason: 'NOT_FOUND' });
    await expect(validateAiResult(invalidReason)).rejects.toBeInstanceOf(BadRequestException);

    const reasonWithCrop = makeAiResult();
    reasonWithCrop.schema_version = '1.2';
    reasonWithCrop.summary.schema_version = '1.2';
    reasonWithCrop.events[0].schema_version = '1.2';
    Object.assign(reasonWithCrop.events[0], {
      plate_crop_path: 'evidence/plate.jpg',
      plate_crop_reason: 'NO_PLATE_DETECTED',
    });
    await expect(validateAiResult(reasonWithCrop)).rejects.toThrow('chỉ được dùng khi plate_crop_path là null');
  });

  it('từ chối plate_crop_path dù null trong schema 1.0', async () => {
    const payload = makeAiResult();
    Object.assign(payload.events[0], { plate_crop_path: null });
    await expect(validateAiResult(payload)).rejects.toThrow('chỉ được phép từ AI schema 1.1 trở lên');
  });

  it('từ chối plate crop traversal và phần mở rộng không phải ảnh', async () => {
    const unsafe = makeAiResult();
    unsafe.schema_version = '1.1';
    unsafe.summary.schema_version = '1.1';
    unsafe.events[0].schema_version = '1.1';
    Object.assign(unsafe.events[0], { plate_crop_path: '../plate.jpg' });
    await expect(validateAiResult(unsafe)).rejects.toThrow('không an toàn');

    const unsupported = makeAiResult();
    unsupported.schema_version = '1.1';
    unsupported.summary.schema_version = '1.1';
    unsupported.events[0].schema_version = '1.1';
    Object.assign(unsupported.events[0], { plate_crop_path: 'evidence/plate.gif' });
    await expect(validateAiResult(unsupported)).rejects.toThrow('ảnh được hỗ trợ');
  });

  it('từ chối schema version không hỗ trợ', async () => {
    await expect(validateAiResult(makeAiResult({ schema_version: '2.0' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối evidence path traversal', async () => {
    const payload = makeAiResult();
    payload.events[0].evidence_path = '../private.jpg';
    await expect(validateAiResult(payload)).rejects.toThrow('không an toàn');
  });

  it('từ chối event UUID bị trùng trong cùng payload', async () => {
    const payload = makeAiResult();
    payload.events.push({ ...payload.events[0] });
    payload.summary.total_candidate_events = 2;
    await expect(validateAiResult(payload)).rejects.toThrow('Trùng event_id');
  });

  it('từ chối unknown fields và vẫn giữ forbidNonWhitelisted ở schema 1.2', async () => {
    const payload = makeAiResult();
    payload.schema_version = '1.2';
    payload.summary.schema_version = '1.2';
    payload.events[0].schema_version = '1.2';
    Object.assign(payload.events[0], {
      plate_crop_path: null,
      plate_crop_reason: 'NO_PLATE_DETECTED',
      forged: true,
    });
    await expect(validateAiResult(payload)).rejects.toBeInstanceOf(BadRequestException);
  });
});
