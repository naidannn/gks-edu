import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';
import { ServiceType } from '../../../prisma/client.js';

export class CreateContractTemplateDto {
  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @ApiProperty({ description: 'Contract text with {{placeholder}} tokens (1C-06)' })
  @IsString()
  @MinLength(20)
  bodyMn!: string;
}
