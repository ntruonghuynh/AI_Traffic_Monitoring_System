import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const SUPPORTED_AI_SCHEMA_VERSION = '1.0';

export enum AiProcessingStatus {
  Running = 'RUNNING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export class AiVideoMetadataDto {
  @IsString()
  @MaxLength(255)
  input_path!: string;

  @IsInt()
  @Min(1)
  width!: number;

  @IsInt()
  @Min(1)
  height!: number;

  @IsNumber()
  @Min(0.000001)
  fps!: number;

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  reported_total_frames!: number | null;

  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  duration_seconds!: number | null;
}

export class AiArtifactsDto {
  @IsString()
  @MaxLength(500)
  result_json!: string;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  annotated_video!: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  legacy_csv!: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  legacy_sqlite!: string | null;
}

export class AiSummaryDto {
  @IsUUID()
  job_id!: string;

  @IsEnum(AiProcessingStatus)
  status!: AiProcessingStatus;

  @ValidateNested()
  @Type(() => AiVideoMetadataDto)
  input_video!: AiVideoMetadataDto;

  @IsDateString()
  started_at!: string;

  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  finished_at!: string | null;

  @IsInt()
  @Min(0)
  processed_frames!: number;

  @IsInt()
  @Min(0)
  total_candidate_events!: number;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  error!: string | null;

  @ValidateNested()
  @Type(() => AiArtifactsDto)
  artifacts!: AiArtifactsDto;

  @IsIn([SUPPORTED_AI_SCHEMA_VERSION])
  schema_version!: string;
}

export class AiEventDto {
  @IsUUID()
  event_id!: string;

  @IsIn(['LINE_CROSSING_CANDIDATE'])
  event_type!: 'LINE_CROSSING_CANDIDATE';

  @IsIn(['PENDING_REVIEW'])
  status!: 'PENDING_REVIEW';

  @IsInt()
  @Min(0)
  track_id!: number;

  @IsString()
  @MaxLength(80)
  vehicle_type!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  plate_number!: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  plate_raw_text!: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(1)
  plate_confidence!: number | null;

  @IsInt()
  @Min(0)
  frame_index!: number;

  @IsNumber()
  @Min(0)
  timestamp_seconds!: number;

  @IsString()
  @MaxLength(80)
  crossing_direction!: string;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  evidence_path!: string | null;

  @IsIn([SUPPORTED_AI_SCHEMA_VERSION])
  schema_version!: string;
}

export class AiProcessingResultDto {
  @ValidateNested()
  @Type(() => AiSummaryDto)
  summary!: AiSummaryDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiEventDto)
  events!: AiEventDto[];

  @IsIn([SUPPORTED_AI_SCHEMA_VERSION])
  schema_version!: string;
}
