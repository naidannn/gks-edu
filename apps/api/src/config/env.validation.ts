import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV?: NodeEnv;

  @IsInt()
  @IsOptional()
  API_PORT?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /** Direct (session-mode) connection — Prisma Migrate cannot run through PgBouncer. */
  @IsString()
  @IsOptional()
  DIRECT_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters long' })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters long' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  QPAY_BASE_URL?: string;

  @IsString()
  @IsOptional()
  QPAY_USERNAME?: string;

  @IsString()
  @IsOptional()
  QPAY_PASSWORD?: string;

  @IsString()
  @IsOptional()
  QPAY_INVOICE_CODE?: string;

  @IsString()
  @IsOptional()
  QPAY_CALLBACK_URL?: string;

  @IsString()
  @IsOptional()
  QPAY_MOCK?: string;

  @IsString()
  @IsOptional()
  STORAGE_DRIVER?: string;

  @IsString()
  @IsOptional()
  STORAGE_LOCAL_DIR?: string;

  @IsString()
  @IsOptional()
  STORAGE_SIGNING_SECRET?: string;

  @IsString()
  @IsOptional()
  SUPABASE_URL?: string;

  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  @IsString()
  @IsOptional()
  SUPABASE_STORAGE_BUCKET?: string;
}

/**
 * Fails fast at boot when required environment variables are missing or weak,
 * instead of surfacing as a confusing runtime error later.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  return config;
}
