import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { ApplicationDecision, ApplicationStatus, ServiceType } from '../../../prisma/client.js';

export class CreateApplicationDto {
  @ApiPropertyOptional({ description: 'Хоосон бол хэргийн сургуулийг авна' })
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional() @IsUUID() @IsOptional() programId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() intakeId?: string;
}

export class UpdateApplicationDto {
  @ApiPropertyOptional() @IsUUID() @IsOptional() universityId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() programId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() intakeId?: string;

  @ApiPropertyOptional({ description: 'Сургуулийн өгсөн бүртгэлийн дугаар' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  applicationNo?: string;

  @ApiPropertyOptional({ description: 'Элсэлтийн хураамж (вон)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  admissionFeeKrw?: number;

  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() note?: string;
}

export class TransitionApplicationDto {
  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  toStatus!: ApplicationStatus;

  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

/** 1E-05 — interview slot plus the preparation note the client reads. */
export class ScheduleInterviewDto {
  @ApiProperty() @IsDateString() interviewAt!: string;

  @ApiPropertyOptional({ description: 'Бэлтгэлийн заавар — хэрэглэгчид харагдана' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  interviewNote?: string;
}

/** 1E-04 — the school asked for more paperwork. */
export class RequestAdditionalDocsDto {
  @ApiProperty({ type: [String], description: 'Материалын загварын ID-ууд' })
  @IsUUID('4', { each: true })
  templateIds!: string[];

  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

export class RecordResultDto {
  @ApiPropertyOptional({ description: 'GKS-д 1 ба 2; энгийн зуучлалд зөвхөн 1', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  @IsOptional()
  round?: number;

  @ApiProperty({ enum: ApplicationDecision })
  @IsEnum(ApplicationDecision)
  decision!: ApplicationDecision;

  @ApiPropertyOptional() @IsDateString() @IsOptional() decidedAt?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

export class QueryApplicationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  @IsOptional()
  status?: ApplicationStatus;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsEnum(ServiceType)
  @IsOptional()
  serviceType?: ServiceType;

  @ApiPropertyOptional() @IsUUID() @IsOptional() universityId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() q?: string;
}
