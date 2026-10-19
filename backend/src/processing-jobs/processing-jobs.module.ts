import { Module } from '@nestjs/common';
import { ProcessingJobsController } from './processing-jobs.controller';
import { ProcessingJobsService } from './processing-jobs.service';

@Module({
  controllers: [ProcessingJobsController],
  providers: [ProcessingJobsService],
  exports: [ProcessingJobsService],
})
export class ProcessingJobsModule {}
