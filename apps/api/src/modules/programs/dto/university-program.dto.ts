import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { InstructionLanguage, ProgramLevel, ProgramSource } from '../../../prisma/client.js';

/** Query strings arrive as "true"/"false"; class-transformer needs the nudge. */
export const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;

/**
 * One programme (анги) at one university, with what it costs.
 *
 * `nameMn` is unique per university and level, so the same department can be
 * run at several levels. The college is optional: a graduate department usually
 * has none, and inventing one would be worse than the gap.
 */
export class CreateProgramDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;

  @ApiProperty({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  level!: ProgramLevel;

  @ApiProperty({ example: 'Маркетинг' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameMn!: string;

  @ApiPropertyOptional({ example: 'Marketing' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  nameEn?: string | null;

  @ApiPropertyOptional({ example: '마케팅학과' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  nameKo?: string | null;

  @ApiPropertyOptional({ description: 'The college this department sits in. Null = none.' })
  @IsUUID()
  @IsOptional()
  facultyId?: string | null;

  /**
   * The other way to say the same thing: a college *name*, which is what a
   * form lets somebody type and what a research run reads off a prospectus.
   * Resolved to a row — created if the school has not got one — before the
   * write. `facultyId` wins when both are given.
   */
  @ApiPropertyOptional({ description: "A college by name, as printed: 공과대학. Created if new." })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  facultyName?: string | null;

  @ApiPropertyOptional({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(10)
  @IsOptional()
  durationYears?: number | null;

  // --- Tuition ---

  @ApiPropertyOptional({ description: 'Per semester, KRW — the figure Korean schools publish' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  tuitionPerTermKrw?: number | null;

  @ApiPropertyOptional({ description: 'Per year, KRW' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  tuitionPerYearKrw?: number | null;

  @ApiPropertyOptional({ description: '입학금 — the one-off entrance fee, KRW' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50_000_000)
  @IsOptional()
  admissionFeeKrw?: number | null;

  @ApiPropertyOptional({ description: 'Academic year these figures were read off' })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  @IsOptional()
  tuitionYear?: number | null;

  @ApiPropertyOptional({ description: 'Best discount a foreign applicant can realistically get, %' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  scholarshipMaxPercent?: number | null;

  @ApiPropertyOptional({ description: 'What that discount depends on, in Mongolian' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  scholarshipNote?: string | null;

  // --- Requirements ---

  @ApiPropertyOptional({ description: 'Minimum TOPIK level for admission (1–6)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  @IsOptional()
  topikLevel?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsOptional()
  ieltsScore?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  otherRequirements?: string | null;

  @ApiPropertyOptional({ enum: InstructionLanguage, default: InstructionLanguage.KOREAN })
  @IsEnum(InstructionLanguage)
  @IsOptional()
  language?: InstructionLanguage;

  @ApiPropertyOptional({ default: true })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  acceptsInternational?: boolean;

  // --- Provenance ---

  @ApiPropertyOptional({ description: "The school page these figures were read off" })
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  @IsOptional()
  sourceUrl?: string | null;

  @ApiPropertyOptional({ enum: ProgramSource, default: ProgramSource.MANUAL })
  @IsEnum(ProgramSource)
  @IsOptional()
  sourceType?: ProgramSource;

  @ApiPropertyOptional({ description: 'Marks the row checked against the school today' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  verified?: boolean;

  @ApiPropertyOptional({ description: 'Internal — never on a public payload' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  internalNote?: string | null;

  @ApiPropertyOptional({ default: true })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

/** The nested `/admin/universities/:id/programs` route takes the school from the path. */
export class CreateUniversityProgramDto extends OmitType(CreateProgramDto, ['universityId'] as const) {}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {}
