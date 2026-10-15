import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { DetectionEventType, ReviewStatus } from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class EventQueryDto extends PaginationQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  videoId?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @ApiPropertyOptional({ enum: DetectionEventType })
  @IsEnum(DetectionEventType)
  eventType?: DetectionEventType;

  @IsOptional()
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsEnum(ReviewStatus)
  reviewStatus?: ReviewStatus;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(80)
  vehicleType?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(40)
  plateNumber?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  from?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  to?: string;

  @IsOptional()
  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTimestampSeconds?: number;
}
