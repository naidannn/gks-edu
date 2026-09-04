import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { ContractType } from '../../../prisma/client.js';

export class CreateContractDto {
  @ApiProperty()
  @IsUUID()
  caseId!: string;

  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  type!: ContractType;
}
