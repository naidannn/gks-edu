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
