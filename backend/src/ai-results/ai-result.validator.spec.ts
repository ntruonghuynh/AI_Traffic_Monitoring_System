import { BadRequestException } from '@nestjs/common';
import { makeAiResult } from '../../test/fixtures/ai-result.fixture';
import { validateAiResult } from './ai-result.validator';

describe('validateAiResult', () => {
  it('chấp nhận OCR nullable đúng contract Phase 01', async () => {
    const result = await validateAiResult(makeAiResult());
    expect(result.events[0].plate_number).toBeNull();
    expect(result.events[0].plate_confidence).toBeNull();
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

  it('từ chối unknown fields', async () => {
    const payload = makeAiResult();
    Object.assign(payload.events[0], { forged: true });
    await expect(validateAiResult(payload)).rejects.toBeInstanceOf(BadRequestException);
  });
});
