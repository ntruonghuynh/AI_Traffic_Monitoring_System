import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewStatus } from '../../generated/prisma/client';

export class ReviewEventDto {
  @ApiProperty({ enum: [ReviewStatus.VERIFIED_CROSSING, ReviewStatus.REJECTED_CANDIDATE] })
  @IsEnum(ReviewStatus)
  reviewStatus!: ReviewStatus;

  @ApiPropertyOptional({ description: 'Ghi chú ngắn; Phase 02 chưa có bảng audit history riêng' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
