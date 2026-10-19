import { Module } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { ProcessingJobsController } from './processing-jobs.controller';
import { ProcessingJobsService } from './processing-jobs.service';

@Module({
  controllers: [ProcessingJobsController],
  providers: [ProcessingJobsService, InternalTokenGuard],
  exports: [ProcessingJobsService],
})
export class ProcessingJobsModule {}
