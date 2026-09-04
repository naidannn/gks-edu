import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EducationLevel, ServiceType } from '../../../prisma/client.js';

const PHONE_PATTERN = /^(976)?\d{8}$/;
const stripPhoneFormatting = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()+-]/g, '') : value;

/** Staff edit of a lead's own fields. Stage moves through `POST /leads/:id/transitions` instead (1B-02). */
export class UpdateLeadDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @Transform(stripPhoneFormatting)
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Утасны дугаар буруу байна' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gpa?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  koreanLevel?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  interestedMajor?: string;

  @ApiPropertyOptional({ description: 'Staff-only free text, distinct from the visitor-submitted note' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;

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
}
