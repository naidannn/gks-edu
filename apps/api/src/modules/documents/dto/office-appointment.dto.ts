import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AppointmentStatus } from '../../../prisma/client.js';

export class CreateOfficeAppointmentDto {
  @ApiProperty({ description: 'Оффист ирэх товлосон цаг' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

export class UpdateOfficeAppointmentDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() scheduledAt?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

/**
 * The staff-wide list of office visits (1D-25). Booking used to be reachable
 * only from the client's own cabinet, so nobody behind the desk could see who
 * was coming — the endpoint this feeds is the front-office day sheet.
 */
export class QueryOfficeAppointmentsDto {
  @ApiPropertyOptional({ enum: AppointmentStatus, description: 'Хоосон бол зөвхөн товлогдсон уулзалтууд' })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @ApiPropertyOptional({ description: 'Эндээс хойших уулзалтууд. Хоосон бол одооноос' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Энэ хүртэлх уулзалтууд' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
