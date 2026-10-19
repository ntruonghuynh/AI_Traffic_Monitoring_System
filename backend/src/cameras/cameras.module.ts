import { Module } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';

@Module({
  controllers: [CamerasController],
  providers: [CamerasService, InternalTokenGuard],
  exports: [CamerasService],
})
export class CamerasModule {}
