import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AppointmentStatus, ConsultationMode } from '../../../prisma/client.js';

export class CreateConsultationAppointmentDto {
  @ApiProperty({ description: 'Уулзалт эхлэх цаг (ISO)' })
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional({ default: 30, description: 'Үргэлжлэх хугацаа, минутаар' })
  @IsInt()
  @Min(15)
  @Max(240)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ enum: ConsultationMode })
  @IsEnum(ConsultationMode)
  @IsOptional()
  mode?: ConsultationMode;

  @ApiProperty({ description: 'Хэнтэй уулзах — сэжим/үйлчлүүлэгч сонгосон бол түүний нэр' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional() @IsString() @MaxLength(20) @IsOptional() phone?: string | null;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() note?: string | null;

  @ApiPropertyOptional() @IsUUID() @IsOptional() leadId?: string | null;
  @ApiPropertyOptional() @IsUUID() @IsOptional() clientId?: string | null;

  @ApiPropertyOptional({ description: 'Уулзах зөвлөх' })
  @IsUUID()
  @IsOptional()
  staffId?: string | null;
}

export class UpdateConsultationAppointmentDto extends PartialType(CreateConsultationAppointmentDto) {
  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  /** Staff fixing an hour onto an assistant booking that only had a day turn this off. */
  @ApiPropertyOptional() @IsBoolean() @IsOptional() allDay?: boolean;
}

export class QueryConsultationCalendarDto {
  @ApiProperty({ description: 'Эхлэх агшин (ISO), багтана' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Дуусах агшин (ISO), багтахгүй' })
  @IsDateString()
  to!: string;
}
