import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { GksRankingMode } from '../../../prisma/client.js';

/** Weights are relative, so any non-negative number is legal; this is a sanity ceiling. */
const MAX_WEIGHT = 100;

/**
 * 1A-29 — retuning the GKS ranking.
 *
 * Every field is optional: the office nudges one weight at a time, and the
 * service upserts the singleton row. Weights need not sum to 100 — the score
 * normalises by their total (see `blend`).
 */
export class UpdateRankingConfigDto {
  @ApiPropertyOptional({
    enum: GksRankingMode,
    default: GksRankingMode.AUTO,
    description: 'AUTO — the weights order the catalogue; MANUAL — the positions staff typed do',
  })
  @IsEnum(GksRankingMode)
  @IsOptional()
  mode?: GksRankingMode;

  @ApiPropertyOptional({ description: 'THE South Korea rank', default: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_WEIGHT)
  @IsOptional()
  weightBaseRank?: number;

  @ApiPropertyOptional({ description: 'Agent contract / commission', default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_WEIGHT)
  @IsOptional()
  weightPartnership?: number;

  @ApiPropertyOptional({ description: 'Fit for a Mongolian applicant', default: 15 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_WEIGHT)
  @IsOptional()
  weightFit?: number;

  @ApiPropertyOptional({ description: 'Our own demand and success history', default: 15 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_WEIGHT)
  @IsOptional()
  weightDemand?: number;

  @ApiPropertyOptional({ description: 'Cost, distance, catalogue completeness', default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_WEIGHT)
  @IsOptional()
  weightPractical?: number;

  @ApiPropertyOptional({
    description: 'Base score for a school THE does not rank — neutral, not zero',
    default: 45,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  unrankedBaseScore?: number;
}

/**
 * A dry run of {@link UpdateRankingConfigDto}: same weights, nothing written.
 * Lets the office see the reshuffled top of the catalogue before saving.
 */
export class PreviewRankingDto extends UpdateRankingConfigDto {
  // `mode` is inherited: previewing AUTO from a catalogue running MANUAL is
  // how the office sees what the formula would do before handing it back.

  @ApiPropertyOptional({ description: 'How many rows of the preview to return', default: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(135)
  @IsOptional()
  limit?: number;
}
