import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum EventStatsGroupBy {
  Day = 'day',
  VehicleType = 'vehicleType',
  ReviewStatus = 'reviewStatus',
}

export class EventStatsQueryDto {
  @ApiProperty({ enum: EventStatsGroupBy })
  @IsEnum(EventStatsGroupBy)
  groupBy!: EventStatsGroupBy;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time', description: 'Mặc định 30 ngày trước thời điểm hiện tại' })
  @IsDateString()
  from?: string;

  @IsOptional()
  @ApiPropertyOptional({ format: 'date-time', description: 'Mặc định thời điểm hiện tại' })
  @IsDateString()
  to?: string;
}
