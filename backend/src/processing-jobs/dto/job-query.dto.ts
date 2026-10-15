import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProcessingJobStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class JobQueryDto extends PaginationQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ enum: ProcessingJobStatus })
  @IsEnum(ProcessingJobStatus)
  status?: ProcessingJobStatus;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  videoId?: string;
}
