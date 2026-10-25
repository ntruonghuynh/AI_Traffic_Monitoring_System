import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { UploadVideoDto } from './dto/upload-video.dto';
import { VideoQueryDto } from './dto/video-query.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post('upload')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
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

  @Get(':id/content')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @ApiProduces('video/mp4', 'video/quicktime', 'video/x-msvideo')
  @ApiOperation({ summary: 'Stream video đã tải lên; hỗ trợ byte Range' })
  @ApiResponse({ status: 206, description: 'Trả về một byte range của video' })
  @ApiResponse({ status: 416, description: 'Byte range không hợp lệ hoặc không thể đáp ứng' })
  async content(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const content = await this.videos.content(id, rangeHeader);
    response.status(content.statusCode);
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Length', String(content.contentLength));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `inline; filename="${id}"`);
    if (content.contentRange) response.setHeader('Content-Range', content.contentRange);
    if (content.stream) {
      const stream = content.stream;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        response.off('close', onResponseClose);
        stream.off('end', cleanup);
        stream.off('close', cleanup);
      };
      const onResponseClose = () => {
        if (!response.writableFinished && !stream.destroyed) stream.destroy();
        cleanup();
      };
      response.once('close', onResponseClose);
      stream.once('end', cleanup);
      stream.once('close', cleanup);
    }
    return new StreamableFile(content.stream ?? Readable.from([]));
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.videos.findOne(id);
  }

  @Delete(':id')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.videos.remove(id);
  }
}
