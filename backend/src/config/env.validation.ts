import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MinLength,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Transform(({ value }) => Number(value ?? 3000))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(?:ql)?:\/\//, { message: 'DATABASE_URL phải là PostgreSQL URL' })
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  STORAGE_ROOT = './storage';

  @Transform(({ value }) => Number(value ?? 104_857_600))
  @IsInt()
  @Min(1)
  MAX_UPLOAD_SIZE = 104_857_600;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  @MinLength(24)
  INTERNAL_API_TOKEN?: string;
}

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });
  if (errors.length > 0) {
    throw new Error(`Cấu hình môi trường không hợp lệ: ${errors.toString()}`);
  }
  return { ...config, ...validated };
}
