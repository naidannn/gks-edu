import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { VisaStatus, VisaType } from '../../../prisma/client.js';

export class OpenVisaCaseDto {
  @ApiPropertyOptional({ enum: VisaType, description: 'Хоосон бол үйлчилгээний төрлөөс тодорхойлно (D-4 хэлний бэлтгэл, D-2 үндсэн анги)' })
  @IsEnum(VisaType)
  @IsOptional()
  visaType?: VisaType;
}

export class UpdateVisaCaseDto {
  @ApiPropertyOptional({ enum: VisaType })
  @IsEnum(VisaType)
  @IsOptional()
  visaType?: VisaType;

  @ApiPropertyOptional({ description: 'Элчин сайдын яамны цаг захиалга' })
  @IsDateString()
  @IsOptional()
  appointmentAt?: string;

  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() note?: string;
}

export class TransitionVisaDto {
  @ApiProperty({ enum: VisaStatus })
  @IsEnum(VisaStatus)
  toStatus!: VisaStatus;

  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

/** 1F-05 — the decision that decides whether the balance is invoiced or refunded. */
export class RecordVisaDecisionDto {
  @ApiProperty({ enum: [VisaStatus.APPROVED, VisaStatus.REJECTED] })
  @IsEnum(VisaStatus)
  decision!: VisaStatus;

  @ApiPropertyOptional() @IsDateString() @IsOptional() decidedAt?: string;
  @ApiPropertyOptional({ description: 'Виз гарсан үед' }) @IsString() @MaxLength(100) @IsOptional() visaNumber?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() expiresAt?: string;
  @ApiPropertyOptional({ description: 'Татгалзсан үед заавал' }) @IsString() @MaxLength(1000) @IsOptional() rejectionReason?: string;
}

export class QueryVisaCasesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VisaStatus })
  @IsEnum(VisaStatus)
  @IsOptional()
  status?: VisaStatus;

  @ApiPropertyOptional() @IsString() @IsOptional() q?: string;
}
