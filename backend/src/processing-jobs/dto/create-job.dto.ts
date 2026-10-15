import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateJobDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  videoId!: string;
}
