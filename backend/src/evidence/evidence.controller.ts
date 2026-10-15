import { Controller, Get, Param, ParseUUIDPipe, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { EvidenceService } from './evidence.service';

@ApiTags('evidence')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get(':id/content')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiProduces('image/jpeg', 'video/mp4', 'application/octet-stream')
  async content(@Param('id', new ParseUUIDPipe()) id: string, @Res({ passthrough: true }) response: Response) {
    const { asset, content } = await this.evidence.read(id);
    response.setHeader('Content-Type', asset.mimeType ?? 'application/octet-stream');
    response.setHeader('Content-Disposition', `inline; filename="${asset.id}"`);
    return new StreamableFile(content);
  }
}
