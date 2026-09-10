import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { EducationLevel } from '../../../prisma/client.js';
import { GPA_MAX_BY_SCALE } from '../gks-eligibility.rules.js';
import type {
  EnglishLevel,
  GksBlocker,
  GksDegree,
  GksStrength,
  GpaScale,
} from '../gks-eligibility.rules.js';

const DEGREES: GksDegree[] = ['BACHELOR', 'MASTER', 'PHD'];
const SCALES: GpaScale[] = ['4.0', '4.3', '4.5', '5.0', '100'];
const ENGLISH: EnglishLevel[] = ['NONE', 'INTERMEDIATE', 'ADVANCED'];
const STRENGTHS: GksStrength[] = [
  'TOP_20_PERCENT',
  'AWARD',
  'RESEARCH',
  'WORK',
  'VOLUNTEER',
  'KOREAN_STUDY',
  'DOCS_STARTED',
];
const BLOCKERS: GksBlocker[] = ['KOREAN_CITIZEN', 'PREVIOUS_GKS', 'DEGREE_IN_KOREA', 'HEALTH'];

/**
 * The grade has to fit the scale it was given on.
 *
 * Validating against 100 whatever the chip says is how `gpa=85` on a 4.0 scale
 * reaches `toGpaPercent`, which clamps it to the scale's own maximum and reads
 * a failing average as a perfect 100 — the criterion flips from failed to top
 * mark on one wrong tap, which is the one direction §3.5 says not to guess in.
 */
@ValidatorConstraint({ name: 'gpaWithinScale' })
class GpaWithinScale implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const max = GPA_MAX_BY_SCALE[(args.object as QueryGksEligibilityDto).gpaScale];
    // An unknown scale is `@IsIn`'s error to report, not a second one here.
    if (max === undefined) return true;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  }

  defaultMessage(args: ValidationArguments): string {
    const scale = (args.object as QueryGksEligibilityDto).gpaScale;
    return `Голч дүн: ${scale} системд 0-ээс ${GPA_MAX_BY_SCALE[scale]} хооронд байх ёстой`;
  }
}

/** `?strengths=AWARD,RESEARCH` — a URL people read, rather than repeated keys. */
const csv = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  return value.split(',').map((part) => part.trim()).filter(Boolean);
};

/**
 * The whole self-check input — eight questions, seven of them a tap.
 *
 * A query rather than a body, for the same reason the planner's is
 * (ARCHITECTURE.md §3.4): the answer is then a link the visitor can reload and
 * a consultant can send back with one thing changed. Nothing is stored, so the
 * URL is the visitor's only copy of what they told us.
 */
export class QueryGksEligibilityDto {
  @ApiProperty({ enum: DEGREES, description: 'Which GKS award — the scholarship funds degrees' })
  @IsIn(DEGREES)
  degree!: GksDegree;

  @ApiProperty({ minimum: 14, maximum: 70, description: 'Age today; the caps are read on the entry date' })
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(70)
  age!: number;

  @ApiProperty({ enum: EducationLevel, description: 'The level they hold or are finishing' })
  @IsEnum(EducationLevel)
  education!: EducationLevel;

  @ApiPropertyOptional({ description: 'Still enrolled at that level, finishing this academic year' })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  @IsOptional()
  graduating = false;

  @ApiProperty({ description: 'Grade average, on the scale named below — checked against that scale' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Validate(GpaWithinScale)
  gpa!: number;

  @ApiProperty({ enum: SCALES, description: 'Which scale that average is on (gksedu.md §24 Q1)' })
  @IsIn(SCALES)
  gpaScale!: GpaScale;

  @ApiPropertyOptional({ minimum: 0, maximum: 6, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  topik = 0;

  @ApiPropertyOptional({ enum: ENGLISH, default: 'NONE' })
  @IsIn(ENGLISH)
  @IsOptional()
  english: EnglishLevel = 'NONE';

  @ApiPropertyOptional({ enum: STRENGTHS, isArray: true })
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(STRENGTHS.length)
  @IsIn(STRENGTHS, { each: true })
  @IsOptional()
  strengths: GksStrength[] = [];

  @ApiPropertyOptional({ enum: BLOCKERS, isArray: true })
  @Transform(csv)
  @IsArray()
  @ArrayMaxSize(BLOCKERS.length)
  @IsIn(BLOCKERS, { each: true })
  @IsOptional()
  blockers: GksBlocker[] = [];
}
