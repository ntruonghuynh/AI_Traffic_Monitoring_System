import { Module } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService, InternalTokenGuard],
})
export class EvidenceModule {}
