import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiNoContentResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { CamerasService } from './cameras.service';
import { CameraQueryDto } from './dto/camera-query.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';

@ApiTags('cameras')
@Controller('cameras')
export class CamerasController {
  constructor(private readonly cameras: CamerasService) {}

  @Post()
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @ApiOperation({ summary: 'Tạo metadata camera' })
  create(@Body() dto: CreateCameraDto) {
    return this.cameras.create(dto);
  }

  @Get()
  findAll(@Query() query: CameraQueryDto) {
    return this.cameras.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cameras.findOne(id);
  }

  @Patch(':id')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateCameraDto) {
    return this.cameras.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(InternalTokenGuard)
  @ApiHeader({ name: 'X-Internal-Token', required: true })
  @ApiSecurity('internal-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Camera bị xóa; video lịch sử được giữ và cameraId thành null' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cameras.remove(id);
  }
}
