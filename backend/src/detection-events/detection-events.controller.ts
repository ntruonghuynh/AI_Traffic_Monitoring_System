import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { DetectionEventsService } from './detection-events.service';
import { EventQueryDto } from './dto/event-query.dto';
import { ReviewEventDto } from './dto/review-event.dto';

@ApiTags('detection-events')
@Controller('events')
export class DetectionEventsController {
  constructor(private readonly events: DetectionEventsService) {}

  @Get()
  findAll(@Query() query: EventQueryDto) {
    return this.events.findAll(query);
  }

  @Get(':id/evidence')
  findEvidence(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.events.findEvidence(id);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.events.findOne(id);
  }

  @Patch(':id/review')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @ApiOperation({ summary: 'Review sự kiện; cần X-Internal-Token' })
  review(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReviewEventDto) {
    return this.events.review(id, dto);
  }
}
