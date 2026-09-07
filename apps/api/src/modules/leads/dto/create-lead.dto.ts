import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EducationLevel, LeadSource, LeadStage, ServiceType } from '../../../prisma/client.js';

const PHONE_PATTERN = /^(976)?\d{8}$/;
const stripPhoneFormatting = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()+-]/g, '') : value;

/**
 * The stages a record may *start* in. Someone walking into the office has
 * already been advised by the time anyone types them in, so the funnel is
 * allowed to open part-way; the rest of the graph is still reached only
 * through `POST /leads/:id/transitions` (1B-02).
 */
export const INITIAL_LEAD_STAGES = [LeadStage.NEW, LeadStage.CONTACTED, LeadStage.CONSULTED] as const;
export type InitialLeadStage = (typeof INITIAL_LEAD_STAGES)[number];

/**
 * Staff registering a person they are talking to — the office walk-in (1B-19).
 *
 * Wider than `CreatePublicLeadDto`: a consultant asks for what the sale will
 * later need (school, grades, language levels, who is handling it) instead of
 * the few fields a website visitor is willing to type.
 */
export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: '99112233' })
  @Transform(stripPhoneFormatting)
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Утасны дугаар буруу байна' })
  phone!: string;

  @ApiPropertyOptional()
  @IsEmail()
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ minimum: 14, maximum: 70 })
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(70)
  @IsOptional()
  age?: number;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  @IsOptional()
  educationLevel?: EducationLevel;

  @ApiPropertyOptional({ description: 'School attended or graduated from' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  schoolName?: string;

  @ApiPropertyOptional({ description: 'Grade average; the scale itself is unsettled (gksedu.md §24)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gpa?: number;

  @ApiPropertyOptional({ example: '4.0' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  gpaScale?: string;

  @ApiPropertyOptional({ example: 'TOPIK 3' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  koreanLevel?: string;

  @ApiPropertyOptional({ example: 'IELTS 6.0' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  englishLevel?: string;

  @ApiPropertyOptional({ enum: ServiceType, isArray: true })
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(ServiceType, { each: true })
  @IsOptional()
  interestedServices?: ServiceType[];

  @ApiPropertyOptional({ isArray: true, type: String, description: 'University ids picked from the catalogue' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  @IsOptional()
  interestedUniversityIds?: string[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  interestedMajor?: string;

  @ApiPropertyOptional({
    enum: LeadSource,
    default: LeadSource.OFFICE,
    description: 'Where the person came from; a staff-typed record is an office visit unless said otherwise',
  })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ enum: INITIAL_LEAD_STAGES, default: LeadStage.CONSULTED })
  @IsIn(INITIAL_LEAD_STAGES)
  @IsOptional()
  stage?: InitialLeadStage;

  @ApiPropertyOptional({ description: 'Staff member handling this person; omit to leave unassigned' })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  nextContactAt?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: 'gksedu.md §15.1 — гэрээ болох магадлал' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  winProbability?: number;

  @ApiPropertyOptional({ description: 'What was said during the consultation; also opens the timeline' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}
