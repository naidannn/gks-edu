import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ContractType } from '../../../prisma/client.js';

export class ChangeContractTypeDto {
  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  type!: ContractType;
}
