import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
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
import { EducationLevel, Gender, ServiceType } from '../../../prisma/client.js';
import {
  PHONE_PATTERN,
  REGISTER_PATTERN,
  TransformPhone,
  TransformRegister,
} from '../../clients/dto/client-fields.js';

/**
 * The client filling in their own record from the portal (1B-18).
 *
 * Deliberately a narrower form than `CreateClientDto`: everything the office
 * decides — status, assigned consultant, source, internal note — is missing,
 * so a self-service save can never touch it.
 */
export class UpsertMyProfileDto {
  @ApiProperty({ example: 'Батбаяр' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: 'Түвшин' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: '2006-04-17', description: 'ISO date' })
  @IsDateString()
  birthDate!: string;

  @ApiProperty({ example: 'УБ12345678' })
  @TransformRegister()
  @IsString()
  @Matches(REGISTER_PATTERN, { message: 'Регистрийн дугаар буруу байна (жишээ: УБ12345678)' })
  registerNumber!: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiProperty({ example: '99112233' })
  @TransformPhone()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Утасны дугаар буруу байна' })
  phone!: string;

  @ApiPropertyOptional()
  @TransformPhone()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Нэмэлт утасны дугаар буруу байна' })
  @IsOptional()
  phoneAlt?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Гэрээнд бичигдэнэ' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  // ── Guardian — mandatory below 18, checked against `birthDate` (§6.2) ──────

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @IsOptional()
  guardianLastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @IsOptional()
  guardianFirstName?: string;

  @ApiPropertyOptional({ example: 'УБ87654321' })
  @TransformRegister()
  @IsString()
  @Matches(REGISTER_PATTERN, { message: 'Асран хамгаалагчийн регистрийн дугаар буруу байна' })
  @IsOptional()
  guardianRegisterNumber?: string;

  @ApiPropertyOptional()
  @TransformPhone()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'Асран хамгаалагчийн утасны дугаар буруу байна' })
  @IsOptional()
  guardianPhone?: string;

  @ApiPropertyOptional({ example: 'Эх' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  guardianRelation?: string;

  // ── Academic background ───────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  @IsOptional()
  educationLevel?: EducationLevel;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(160)
  @IsOptional()
  schoolName?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  gpa?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  gpaScale?: string;

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

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  passportExpiry?: string;

  // ── What they came for — the case they open later starts from these ───────

  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  primaryServiceType!: ServiceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  targetUniversityId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetMajor?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  plannedIntakeId?: string;
}
