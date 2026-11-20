import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { REPORT_PRESETS, type ReportPreset } from '../report-period.js';
import { REPORT_EXPORTS, REPORT_WORKBOOKS, type ReportExport, type ReportWorkbook } from '../report-types.js';

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

/** `GET /reports/excel` — the same period, plus which workbook (1M-11). */
export class ReportWorkbookQueryDto extends ReportQueryDto {
  @ApiProperty({ enum: REPORT_WORKBOOKS })
  @IsIn(REPORT_WORKBOOKS as unknown as string[], { message: 'Ийм тайлан алга' })
  report!: ReportWorkbook;
}

/**
 * `POST /reports/email` (1M-11). The period comes in the body rather than the
 * query so one request says everything that went into the mail.
 */
export class ReportEmailDto extends ReportQueryDto {
  @ApiProperty({ enum: REPORT_WORKBOOKS, isArray: true })
  @IsArray()
  @ArrayMinSize(1, { message: 'Дор хаяж нэг тайлан сонгоно уу' })
  @IsIn(REPORT_WORKBOOKS as unknown as string[], { each: true, message: 'Ийм тайлан алга' })
  workbooks!: ReportWorkbook[];

  /** Staff account ids — never free-text addresses (see `ReportMailService`). */
  @ApiProperty({ type: [String], description: 'Хүлээн авагч ажилтны id' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Дор хаяж нэг хүлээн авагч сонгоно уу' })
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  recipientIds!: string[];
}
