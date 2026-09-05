import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Admissions configuration (1H-02). Business values, not constants — the
 * office retunes the lead time and the reminder ladder without a deploy,
 * exactly like `ServicePricing` and `GksRankingConfig`.
 */
export class UpdateAdmissionConfigDto {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 180,
    description: "How many days before the school's deadline our own falls. Currently 7.",
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  @IsOptional()
  internalLeadDays?: number;

  @ApiPropertyOptional({ type: [Number], description: 'Days before our deadline a client is reminded' })
  @IsArray()
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(365, { each: true })
  @IsOptional()
  clientReminderOffsets?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'Days before our deadline staff are warned' })
  @IsArray()
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(365, { each: true })
  @IsOptional()
  staffReminderOffsets?: number[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'Below this readiness % a case is at risk' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  riskReadinessThreshold?: number;

  @ApiPropertyOptional({ description: 'Gemini model the research button runs against' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  researchModel?: string;
}
