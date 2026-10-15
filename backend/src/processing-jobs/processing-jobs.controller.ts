import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateJobDto } from './dto/create-job.dto';
import { JobQueryDto } from './dto/job-query.dto';
import { ProcessingJobsService } from './processing-jobs.service';

@ApiTags('processing-jobs')
@Controller('jobs')
export class ProcessingJobsController {
  constructor(private readonly jobs: ProcessingJobsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo job PENDING; không tự chạy Python trong Phase 02' })
  create(@Body() dto: CreateJobDto) {
    return this.jobs.create(dto);
  }

  @Get()
  findAll(@Query() query: JobQueryDto) {
    return this.jobs.findAll(query);
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
