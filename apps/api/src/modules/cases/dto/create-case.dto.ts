import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ServiceType } from '../../../prisma/client.js';

export class CreateCaseDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  intakeId?: string;
}
