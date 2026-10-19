import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiResultsModule } from '../ai-results/ai-results.module';
import { validateEnvironment } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { AiJobWorkerService } from './ai-job-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    PrismaModule,
    StorageModule,
    AiResultsModule,
  ],
  providers: [AiJobWorkerService],
  exports: [AiJobWorkerService],
})
export class WorkerModule {}
