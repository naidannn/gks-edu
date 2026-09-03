import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { EducationLevel, ServiceType } from '../../../prisma/client.js';

/** Mongolian mobile numbers: 8 digits, optionally +976-prefixed. */
const PHONE_PATTERN = /^(976)?\d{8}$/;

/** People type "9911-2233", "+976 9911 2233" … — compare digits, not formatting. */
const stripPhoneFormatting = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()+-]/g, '') : value;

export class LeadUtmDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  source?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  medium?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  campaign?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  landingPage?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  referrer?: string;
}

export class CreatePublicLeadDto {
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

  @ApiPropertyOptional({ description: 'Grade average; the scale itself is unsettled (gksedu.md §24)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gpa?: number;

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

  @ApiPropertyOptional({ isArray: true, type: String, description: 'University slugs the visitor picked' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @IsOptional()
  interestedUniversitySlugs?: string[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  interestedMajor?: string;

  @ApiPropertyOptional({ description: 'Free-text question from the visitor' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ type: LeadUtmDto })
  @ValidateNested()
  @Type(() => LeadUtmDto)
  @IsOptional()
  utm?: LeadUtmDto;

  /**
   * Honeypot. Real visitors never see this field, so anything in it is a bot;
   * the request is accepted and dropped rather than rejected, to stay quiet.
   */
  @ApiPropertyOptional({ description: 'Leave empty — spam trap' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  website?: string;
}
