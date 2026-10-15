import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CameraStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CameraQueryDto extends PaginationQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ enum: CameraStatus })
  @IsEnum(CameraStatus)
  status?: CameraStatus;
}
