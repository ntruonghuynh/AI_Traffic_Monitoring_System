import { Module } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { DetectionEventsController } from './detection-events.controller';
import { DetectionEventsService } from './detection-events.service';

@Module({
  controllers: [DetectionEventsController],
  providers: [DetectionEventsService, InternalTokenGuard],
  exports: [DetectionEventsService],
})
export class DetectionEventsModule {}
