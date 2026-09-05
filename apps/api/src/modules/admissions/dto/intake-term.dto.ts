import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { INTAKE_MONTHS } from '../intake-deadline.js';
import { IntakeSource, IntakeStatus, ProgramLevel } from '../../../prisma/client.js';

export { INTAKE_MONTHS };

export class CreateIntakeTermDto {
  @ApiProperty({ description: 'The school this round belongs to' })
  @IsUUID()
  universityId!: string;

  @ApiProperty({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  level!: ProgramLevel;

  @ApiProperty({ example: 2027 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiProperty({ enum: INTAKE_MONTHS, description: '3, 6, 9 or 12' })
  @Type(() => Number)
  @IsIn(INTAKE_MONTHS)
  month!: number;

  @ApiPropertyOptional({ description: 'ISO date — the school opens its window' })
  @IsDateString()
  @IsOptional()
  openAt?: string | null;

  @ApiPropertyOptional({ description: "ISO date — the SCHOOL's last day for documents" })
  @IsDateString()
  @IsOptional()
  applicationDeadline?: string | null;

  @ApiPropertyOptional({
    description:
      'ISO date — OUR last day. Leave unset and it is computed as ' +
      '`applicationDeadline − AdmissionConfig.internalLeadDays`; send a value and it is ' +
      'frozen against future recomputes.',
  })
  @IsDateString()
  @IsOptional()
  internalDeadline?: string | null;

  @ApiPropertyOptional({ description: 'ISO date — first day of classes' })
  @IsDateString()
  @IsOptional()
  classStartDate?: string | null;

  @ApiPropertyOptional({ description: 'ISO date — the school announces its decision' })
  @IsDateString()
  @IsOptional()
  resultAnnouncedAt?: string | null;

  @ApiPropertyOptional({ description: 'Seats in this round' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  @IsOptional()
  quota?: number | null;

  @ApiPropertyOptional({ description: 'Элсэлтийн хураамж, KRW' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  @IsOptional()
  admissionFeeKrw?: number | null;

  @ApiPropertyOptional({ description: 'What this round asks for beyond the standard set' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  requirementNote?: string | null;

  @ApiPropertyOptional({ enum: IntakeStatus, default: IntakeStatus.PLANNED })
  @IsEnum(IntakeStatus)
  @IsOptional()
  status?: IntakeStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string | null;

  @ApiPropertyOptional({ description: "The school's announcement page these dates came off" })
  @IsUrl()
  @MaxLength(500)
  @IsOptional()
  sourceUrl?: string | null;

  @ApiPropertyOptional({
    enum: IntakeSource,
    description: 'AI_ASSISTED when staff accepted a Gemini research candidate',
  })
  @IsEnum(IntakeSource)
  @IsOptional()
  sourceType?: IntakeSource;

  @ApiPropertyOptional({ description: 'Mark these dates as checked against the school' })
  @IsBoolean()
  @IsOptional()
  verified?: boolean;
}

/** `universityId` is fixed once created — moving a round between schools is a delete. */
export class UpdateIntakeTermDto extends PartialType(CreateIntakeTermDto) {
  @ApiPropertyOptional({ readOnly: true })
  @IsOptional()
  override universityId?: string;
}

/** `POST /admin/admissions/bulk` — save several reviewed rounds in one go. */
export class BulkCreateIntakeTermsDto {
  @ApiProperty({ type: [CreateIntakeTermDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateIntakeTermDto)
  intakes!: CreateIntakeTermDto[];
}

export class UpsertIntakeProgramOverrideDto {
  @ApiProperty()
  @IsUUID()
  programId!: string;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsDateString()
  @IsOptional()
  openAt?: string | null;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsDateString()
  @IsOptional()
  applicationDeadline?: string | null;

  @ApiPropertyOptional({ description: 'ISO date — freezes against recompute when sent' })
  @IsDateString()
  @IsOptional()
  internalDeadline?: string | null;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsDateString()
  @IsOptional()
  classStartDate?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  @IsOptional()
  quota?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string | null;
}

/**
 * The school comes from the path on `/admin/universities/:id/intakes`, which
 * is where the catalogue detail page still edits its rounds (1A-27).
 */
export class CreateIntakeTermForUniversityDto extends OmitType(CreateIntakeTermDto, ['universityId'] as const) {}
export class UpdateIntakeTermForUniversityDto extends PartialType(CreateIntakeTermForUniversityDto) {}
