import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { CameraSourceType, CameraStatus } from '../../generated/prisma/client';

export class CreateCameraDto {
  @ApiProperty({ example: 'Camera cổng A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Khuôn viên thử nghiệm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: CameraSourceType, default: CameraSourceType.FILE_UPLOAD })
  @IsOptional()
  @IsEnum(CameraSourceType)
  sourceType?: CameraSourceType;

  @ApiPropertyOptional({ enum: CameraStatus, default: CameraStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CameraStatus)
  status?: CameraStatus;

  @ApiPropertyOptional({ description: 'Metadata line/zone; không chứa credentials' })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
