import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { CaseStage, ServiceType } from '../../../prisma/client.js';

export class QueryCasesDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: CaseStage })
  @IsEnum(CaseStage)
  @IsOptional()
  stage?: CaseStage;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsEnum(ServiceType)
  @IsOptional()
  serviceType?: ServiceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedConsultantId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedDocOfficerId?: string;
}
