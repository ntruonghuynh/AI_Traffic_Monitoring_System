import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          files: 1,
          fileSize: config.getOrThrow<number>('MAX_UPLOAD_SIZE'),
          fields: 5,
          parts: 6,
        },
      }),
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService, InternalTokenGuard],
  exports: [VideosService],
})
export class VideosModule {}
