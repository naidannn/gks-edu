import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Every knob on the assistant (2B-02, 2E-05).
 *
 * All optional: the screen sends what changed. The bounds are the ones that
 * would cost money or quality if somebody typed a zero — a token budget of 0
 * silently turns the assistant off without using the switch that says so, and a
 * similarity floor of 0 hands the model every chunk in the base.
 */
export class UpdateAiConfigDto {
  @ApiPropertyOptional({ description: 'The kill switch (AI-ASSISTANT.md principle 8)' })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'A `deepseek-` prefix routes to DeepSeek; anything else to Gemini' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  chatModel?: string;

  @ApiPropertyOptional({ description: 'Used once after a 429 or a 5xx from the primary model' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  fallbackModel?: string;

  @ApiPropertyOptional({ description: 'Changing this re-embeds the entire knowledge base' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  embeddingModel?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  temperature?: number;

  @ApiPropertyOptional({ minimum: 100, maximum: 4000 })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(4000)
  @IsOptional()
  maxOutputTokens?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, description: 'Chunks handed to the model per turn' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  retrievalTopK?: number;

  @ApiPropertyOptional({
    minimum: 0.3,
    maximum: 0.95,
    description:
      'Cosine floor. Measured on this corpus: an unrelated document scores ~0.62 and a real match ~0.75, so below 0.6 is noise and above 0.8 is silence.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.3)
  @Max(0.95)
  @IsOptional()
  minSimilarity?: number;

  @ApiPropertyOptional({ minimum: 4, maximum: 200 })
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(200)
  @IsOptional()
  sessionMessageLimit?: number;

  @ApiPropertyOptional({ minimum: 5_000, description: 'Tokens one conversation may spend' })
  @Type(() => Number)
  @IsInt()
  @Min(5_000)
  @IsOptional()
  sessionTokenBudget?: number;

  @ApiPropertyOptional({ minimum: 50_000, description: 'Tokens the whole platform may spend in a day (§15-31)' })
  @Type(() => Number)
  @IsInt()
  @Min(50_000)
  @IsOptional()
  dailyTokenBudget?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  leadCaptureAfterMessages?: number;

  @ApiPropertyOptional({ description: 'The first line the widget shows' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  @IsOptional()
  greeting?: string;

  @ApiPropertyOptional({ description: 'Who the assistant is. Joins every system prompt (§5.2)' })
  @IsString()
  @MinLength(20)
  @MaxLength(2_000)
  @IsOptional()
  persona?: string;

  @ApiPropertyOptional({ type: Object, description: 'Which CTA card follows which intent (§6.4)' })
  @IsOptional()
  ctaRules?: unknown;

  @ApiPropertyOptional({ type: Object, description: 'Office hours for a live handoff (§15-30)' })
  @IsObject()
  @IsOptional()
  handoffHours?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  copilotEnabled?: boolean;
}
