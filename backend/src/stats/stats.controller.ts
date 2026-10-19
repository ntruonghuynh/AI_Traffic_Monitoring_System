import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventStatsQueryDto } from './dto/event-stats-query.dto';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Tổng số camera, video, job và event theo trạng thái' })
  overview() {
    return this.stats.overview();
  }

  @Get('events')
  @ApiOperation({ summary: 'Nhóm số event theo ngày UTC, loại phương tiện hoặc trạng thái review' })
  eventGroups(@Query() query: EventStatsQueryDto) {
    return this.stats.eventGroups(query);
  }
}
