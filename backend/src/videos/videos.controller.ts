import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadVideoDto } from './dto/upload-video.dto';
import { VideoQueryDto } from './dto/video-query.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload video vào local storage và tạo metadata' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, cameraId: { type: 'string', format: 'uuid' } } } })
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadVideoDto) {
    return this.videos.upload(file, dto);
  }

  @Get()
  findAll(@Query() query: VideoQueryDto) {
    return this.videos.findAll(query);
  }

  @Get(':id/jobs')
  findJobs(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.videos.findJobs(id);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.videos.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.videos.remove(id);
  }
}
