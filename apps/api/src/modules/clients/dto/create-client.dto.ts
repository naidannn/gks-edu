import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { ClientStatus, EducationLevel, Gender, LeadSource, ServiceType } from '../../../prisma/client.js';
import { UniversityChoiceDto } from '../../cases/dto/university-choice.dto.js';
import { TransformEmail } from '../../../common/validation/transforms.js';
import {
  PHONE_PATTERN,
  REGISTER_PATTERN,
  TransformPhone,
  TransformRegister,
} from './client-fields.js';

/**
 * Staff registration of a client (1B-14). Everything the brokerage contract
 * needs is collected here; the guardian block becomes mandatory for a minor,
 * which the service checks against `birthDate` rather than a client-sent flag.
 */
export class CreateClientDto {
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
  @Matches(PHONE_PATTERN)
  phone!: string;

  @ApiPropertyOptional()
  @TransformPhone()
  @IsString()
  @Matches(PHONE_PATTERN)
  @IsOptional()
  phoneAlt?: string;

  @ApiPropertyOptional()
  @TransformEmail()
  @IsEmail()
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  // ── Guardian (төлөөлөн гэрээ байгуулагч) ──────────────────────────────────

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
  @Matches(PHONE_PATTERN)
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

  @ApiPropertyOptional({ description: 'gksedu.md §24 асуулт 1 — шаталбар батлагдаагүй' })
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

  // ── Service selection ─────────────────────────────────────────────────────

  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  primaryServiceType!: ServiceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  targetUniversityId?: string;

  /**
   * Every school the client picked, in preference order — two for a GKS
   * scholarship plus the one extra ordinary school the contract grants free of
   * charge, or up to three for ordinary brokerage (§5.1). The first of them
   * becomes `targetUniversityId`; `targetUniversityId` on its own still works
   * as the one-school shorthand.
   */
  @ApiPropertyOptional({ type: [UniversityChoiceDto] })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => UniversityChoiceDto)
  @IsOptional()
  universityChoices?: UniversityChoiceDto[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetMajor?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  plannedIntakeId?: string;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.OFFICE })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ enum: ClientStatus, default: ClientStatus.ACTIVE })
  @IsEnum(ClientStatus)
  @IsOptional()
  status?: ClientStatus;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedConsultantId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Open the first Case for `primaryServiceType` straight away (CONTRACT_DRAFT).',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  openCase?: boolean = true;
}
