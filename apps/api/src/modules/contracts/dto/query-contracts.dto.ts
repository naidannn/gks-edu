import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { ContractStatus, ContractType } from '../../../prisma/client.js';

export class QueryContractsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: ContractStatus })
  @IsEnum(ContractStatus)
  @IsOptional()
  status?: ContractStatus;

  @ApiPropertyOptional({ enum: ContractType })
  @IsEnum(ContractType)
  @IsOptional()
  type?: ContractType;
}
