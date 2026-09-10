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

  /** OAuth 2.0 Web client id — the audience every Google ID token is verified against. */
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  FX_RATES_URL?: string;

  @IsString()
  @IsOptional()
  FX_FALLBACK_KRW_RATE?: string;

  /** 1H-10 — Gemini with Google Search grounding, for intake-date research. */
  @IsString()
  @IsOptional()
  GEMINI_API_KEY?: string;

  @IsString()
  @IsOptional()
  GEMINI_MODEL?: string;

  @IsString()
  @IsOptional()
  GEMINI_BASE_URL?: string;

  @IsString()
  @IsOptional()
  GEMINI_TIMEOUT_MS?: string;

  @IsString()
  @IsOptional()
  GEMINI_MOCK?: string;

  /**
   * `false` drops the Google Search tool from the request and leaves the model
   * answering from memory — the fallback for a key whose Google project has no
   * grounding quota, which answers every grounded call with a 429. See
   * `gemini.service.ts`.
   */
  @IsString()
  @IsOptional()
  GEMINI_SEARCH?: string;

  /** 1I-07 — DeepSeek, for the programme-and-tuition search. No grounding. */
  @IsString()
  @IsOptional()
  DEEPSEEK_API_KEY?: string;

  @IsString()
  @IsOptional()
  DEEPSEEK_BASE_URL?: string;

  @IsString()
  @IsOptional()
  DEEPSEEK_TIMEOUT_MS?: string;

  @IsString()
  @IsOptional()
  DEEPSEEK_MAX_OUTPUT_TOKENS?: string;

  @IsString()
  @IsOptional()
  DEEPSEEK_MOCK?: string;

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
  RESEND_API_KEY?: string;

  @IsString()
  @IsOptional()
  NOTIFICATION_FROM_EMAIL?: string;

  @IsString()
  @IsOptional()
  NOTIFICATION_STAFF_EMAIL?: string;

  @IsString()
  @IsOptional()
  NOTIFICATION_REPLY_TO?: string;

  @IsString()
  @IsOptional()
  APP_PUBLIC_URL?: string;

  @IsString()
  @IsOptional()
  SMS_DAILY_LIMIT_PER_USER?: string;

  @IsString()
  @IsOptional()
  SMS_DAILY_LIMIT_GLOBAL?: string;

  /** Slack bot token (`xoxb-…`) with `chat:write`; unset logs instead of posting. */
  @IsString()
  @IsOptional()
  SLACK_BOT_TOKEN?: string;

  @IsString()
  @IsOptional()
  SLACK_CHANNEL_ID?: string;

  /** 1A-38 — Meta dataset (pixel) id. Same value as NUXT_PUBLIC_META_PIXEL_ID. */
  @IsString()
  @IsOptional()
  META_PIXEL_ID?: string;

  /** Conversions API system-user token. Unset logs instead of sending. */
  @IsString()
  @IsOptional()
  META_CAPI_ACCESS_TOKEN?: string;

  @IsString()
  @IsOptional()
  META_GRAPH_VERSION?: string;

  @IsString()
  @IsOptional()
  META_TEST_EVENT_CODE?: string;

  @IsString()
  @IsOptional()
  META_CAPI_TIMEOUT_MS?: string;

  @IsString()
  @IsOptional()
  META_CAPI_MOCK?: string;

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
