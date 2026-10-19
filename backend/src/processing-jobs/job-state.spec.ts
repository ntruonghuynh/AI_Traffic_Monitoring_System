import { ConflictException } from '@nestjs/common';
import { ProcessingJobStatus } from '../generated/prisma/client';
import { assertJobTransition } from './job-state';

describe('assertJobTransition', () => {
  it('cho phép PENDING -> PROCESSING -> COMPLETED', () => {
    expect(() => assertJobTransition(ProcessingJobStatus.PENDING, ProcessingJobStatus.PROCESSING)).not.toThrow();
    expect(() => assertJobTransition(ProcessingJobStatus.PROCESSING, ProcessingJobStatus.COMPLETED)).not.toThrow();
  });

  it('từ chối PENDING -> COMPLETED trực tiếp', () => {
    expect(() => assertJobTransition(ProcessingJobStatus.PENDING, ProcessingJobStatus.COMPLETED)).toThrow(ConflictException);
  });

  it('từ chối thay đổi terminal state', () => {
    expect(() => assertJobTransition(ProcessingJobStatus.COMPLETED, ProcessingJobStatus.FAILED)).toThrow(ConflictException);
  });
});
