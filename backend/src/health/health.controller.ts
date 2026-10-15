import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness: process ứng dụng đang hoạt động' })
  live() {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: kết nối PostgreSQL sẵn sàng' })
  async ready(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.health.readiness();
    if (!readiness.ready) response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return readiness;
  }

  @Get()
  @ApiOperation({ summary: 'Tổng hợp liveness và database readiness' })
  async aggregate(@Res({ passthrough: true }) response: Response) {
    const application = this.health.liveness();
    const database = await this.health.readiness();
    const payload = {
      status: database.ready ? 'ok' : 'degraded',
      alive: true,
      ready: database.ready,
      checks: { application: application.checks.application, database: database.checks.database },
      timestamp: new Date().toISOString(),
    };
    if (!database.ready) response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return payload;
  }
}
