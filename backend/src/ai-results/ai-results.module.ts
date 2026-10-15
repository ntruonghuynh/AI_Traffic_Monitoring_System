import { Module } from '@nestjs/common';
import { AiResultImportService } from './ai-result-import.service';

@Module({
  providers: [AiResultImportService],
  exports: [AiResultImportService],
})
export class AiResultsModule {}
