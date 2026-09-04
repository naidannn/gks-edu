import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ServiceType } from '../../../prisma/client.js';

/** The client opening their own service cycle from the portal (1C-23). */
export class StartMyCaseDto {
  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @ApiPropertyOptional({ description: 'Зорилтот сургууль — сонгоогүй байж болно' })
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  intakeId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  targetMajor?: string;
}
