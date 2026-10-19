import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiResultsModule } from './ai-results/ai-results.module';
import { CamerasModule } from './cameras/cameras.module';
import { validateEnvironment } from './config/env.validation';
import { DetectionEventsModule } from './detection-events/detection-events.module';
import { EvidenceModule } from './evidence/evidence.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcessingJobsModule } from './processing-jobs/processing-jobs.module';
import { StorageModule } from './storage/storage.module';
import { StatsModule } from './stats/stats.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    StorageModule,
    CamerasModule,
    VideosModule,
    ProcessingJobsModule,
    DetectionEventsModule,
    EvidenceModule,
    AiResultsModule,
    HealthModule,
    StatsModule,
  ],
})
export class AppModule {}
