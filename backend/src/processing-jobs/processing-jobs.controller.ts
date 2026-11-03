import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { streamContentResponse } from '../storage/stream-content';
import { CreateJobDto } from './dto/create-job.dto';
import { JobQueryDto } from './dto/job-query.dto';
import { ProcessingJobsService } from './processing-jobs.service';

@ApiTags('processing-jobs')
@Controller('jobs')
export class ProcessingJobsController {
  constructor(private readonly jobs: ProcessingJobsService) {}

  @Post()
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @ApiOperation({ summary: 'Tạo job PENDING; không tự chạy Python trong Phase 02' })
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  findAll(@Query() query: JobQueryDto) {
    return this.jobs.findAll(query);
  }

  @Get(':id/annotated-video')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @ApiProduces('video/mp4')
  @ApiOperation({ summary: 'Stream video đã chú thích của job; hỗ trợ byte Range' })
  @ApiResponse({ status: 206, description: 'Trả về một byte range của video chú thích' })
  @ApiResponse({ status: 416, description: 'Byte range không hợp lệ hoặc không thể đáp ứng' })
  async annotatedVideo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const content = await this.jobs.annotatedVideoContent(id, rangeHeader);
    return streamContentResponse(content, response, `${id}-annotated.mp4`);
  }

  @Get(':id/events')
  findEvents(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.findEvents(id);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobs.findOne(id);
  }
}
