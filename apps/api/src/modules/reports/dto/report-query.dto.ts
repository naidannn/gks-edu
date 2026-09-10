import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { REPORT_PRESETS, type ReportPreset } from '../report-period.js';
import { REPORT_EXPORTS, type ReportExport } from '../report-types.js';

/** `YYYY-MM-DD`, office-local. Anything else is a typo, not a date. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @ApiPropertyOptional({ enum: REPORT_PRESETS, default: 'month' })
  @IsOptional()
  @IsIn(REPORT_PRESETS as unknown as string[])
  preset: ReportPreset = 'month';

  @ApiPropertyOptional({ description: 'preset=custom үед эхлэх огноо (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(ISO_DAY, { message: 'Огноо YYYY-MM-DD хэлбэртэй байна' })
  from?: string;

  @ApiPropertyOptional({ description: 'preset=custom үед дуусах огноо, тухайн өдрийг оруулна (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(ISO_DAY, { message: 'Огноо YYYY-MM-DD хэлбэртэй байна' })
  to?: string;

  /**
   * How long a case may sit in one stage before it is called stalled. A display
   * threshold the office can slide, not a rule from the spec.
   */
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  stallDays?: number;

  /** How far ahead the deadline countdown looks. */
  @ApiPropertyOptional({ minimum: 1, maximum: 730, default: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(730)
  horizonDays?: number;
}

/**
 * The export route takes the same period as every report, plus which one to
 * render. It needs its own class because the global validation pipe rejects a
 * query field no DTO declares — and rightly so.
 */
export class ReportExportQueryDto extends ReportQueryDto {
  @ApiProperty({ enum: REPORT_EXPORTS })
  @IsIn(REPORT_EXPORTS as unknown as string[], { message: 'Ийм тайлан алга' })
  report!: ReportExport;
}
