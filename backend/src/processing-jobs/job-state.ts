import { ConflictException } from '@nestjs/common';
import { ProcessingJobStatus } from '../generated/prisma/client';

const ALLOWED_TRANSITIONS: Readonly<Record<ProcessingJobStatus, readonly ProcessingJobStatus[]>> = {
  PENDING: [ProcessingJobStatus.PROCESSING, ProcessingJobStatus.FAILED],
  PROCESSING: [ProcessingJobStatus.COMPLETED, ProcessingJobStatus.FAILED],
  COMPLETED: [],
  FAILED: [],
};

export function assertJobTransition(from: ProcessingJobStatus, to: ProcessingJobStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(`Không cho phép chuyển processing job từ ${from} sang ${to}`);
  }
}
