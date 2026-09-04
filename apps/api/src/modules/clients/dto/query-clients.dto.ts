import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { CaseStage, ClientStatus, LeadSource, ServiceType } from '../../../prisma/client.js';

export const CLIENT_SORTS = ['createdAt', 'updatedAt', 'lastName'] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

/**
 * The "who needs me today" filters (1G-17). Each one is a fact another module
 * already stores, read one join away from the client row.
 */
export const CLIENT_ATTENTION_FILTERS = ['MISSING_DOCS', 'PENDING_PAYMENT', 'OVERDUE_TASK', 'DEADLINE_SOON'] as const;
export type ClientAttentionFilter = (typeof CLIENT_ATTENTION_FILTERS)[number];

/** Staff-side client search/filter (1B-14). */
export class QueryClientsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Нэр, утас, регистр, код эсвэл имэйлийн хэсэг' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsEnum(ServiceType)
  @IsOptional()
  serviceType?: ServiceType;

  @ApiPropertyOptional({ enum: CaseStage, description: 'Зуучлалын үе шат — идэвхтэй хэргээр нь шүүнэ' })
  @IsEnum(CaseStage)
  @IsOptional()
  stage?: CaseStage;

  @ApiPropertyOptional({ enum: ClientStatus })
  @IsEnum(ClientStatus)
  @IsOptional()
  status?: ClientStatus;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'UUID, эсвэл "unassigned"' })
  @IsString()
  @IsOptional()
  assignedConsultantId?: string;

  @ApiPropertyOptional({ description: 'Гэрээтэй эсэхээр шүүх' })
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  @IsOptional()
  hasContract?: boolean;

  @ApiPropertyOptional({ enum: CLIENT_ATTENTION_FILTERS, description: 'Анхаарал шаардсан хэрэглэгчээр шүүх' })
  @IsIn(CLIENT_ATTENTION_FILTERS)
  @IsOptional()
  attention?: ClientAttentionFilter;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdTo?: string;

  @ApiPropertyOptional({ enum: CLIENT_SORTS, default: 'createdAt' })
  @IsIn(CLIENT_SORTS)
  @IsOptional()
  sort: ClientSort = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  @Type(() => String)
  order: 'asc' | 'desc' = 'desc';
}
