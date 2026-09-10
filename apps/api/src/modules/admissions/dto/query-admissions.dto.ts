import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { IntakeStatus, ProgramLevel } from '../../../prisma/client.js';
import { toBoolean } from '../../programs/dto/university-program.dto.js';
import { INTAKE_MONTHS } from '../intake-deadline.js';

/** `deadline` first: an admissions list is a list of things about to close. */
export const ADMISSION_SORTS = ['deadline', 'classStart', 'gks', 'university'] as const;
export type AdmissionSort = (typeof ADMISSION_SORTS)[number];

/** The public list — only published rounds ever come back. */
export class QueryAdmissionsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Fuzzy search over the school name and city' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  @IsOptional()
  level?: ProgramLevel;

  @ApiPropertyOptional({ example: 2027 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({ enum: INTAKE_MONTHS })
  @Type(() => Number)
  @IsIn(INTAKE_MONTHS)
  @IsOptional()
  month?: number;

  @ApiPropertyOptional({ description: 'regionEn, e.g. "Seoul"' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  region?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({
    description: 'Only rounds still open to a new applicant (excludes CLOSED). Default true.',
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  openOnly?: boolean;

  @ApiPropertyOptional({ enum: ADMISSION_SORTS, default: 'deadline' })
  @IsIn(ADMISSION_SORTS)
  @IsOptional()
  sort: AdmissionSort = 'deadline';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  order: 'asc' | 'desc' = 'asc';
}

/** The staff list — adds the drafts and the unverified filter. */
export class QueryAdminAdmissionsDto extends QueryAdmissionsDto {
  @ApiPropertyOptional({ enum: IntakeStatus })
  @IsEnum(IntakeStatus)
  @IsOptional()
  status?: IntakeStatus;

  @ApiPropertyOptional({ description: 'Only rounds nobody has checked against the school yet' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  unverified?: boolean;

  @ApiPropertyOptional({ description: 'Only rounds with no deadline recorded — the ones to chase' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  missingDates?: boolean;
}

/**
 * The intake board's filters (1H-08).
 *
 * A DTO rather than three raw `@Query()` strings: both ids land in a `where` on
 * `uuid` columns, and Postgres answers a malformed one with an error the API
 * can only turn into a 500.
 */
export class QueryAdmissionsBoardDto {
  @ApiPropertyOptional({ description: 'Only cases at this school' })
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({ description: 'Only cases this consultant or document officer is on' })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Only the cases short on documents with the deadline in sight' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  onlyAtRisk?: boolean;
}

/** The flat at-risk list takes the same assignee filter and nothing else. */
export class QueryAtRiskDto {
  @ApiPropertyOptional({ description: 'Only cases this consultant or document officer is on' })
  @IsUUID()
  @IsOptional()
  assigneeId?: string;
}
