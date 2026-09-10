import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { UUID_OR_UNASSIGNED } from '../../../common/validation/transforms.js';
import { LeadSource, LeadStage } from '../../../prisma/client.js';

export const LEAD_SORTS = ['createdAt', 'nextContactAt', 'updatedAt'] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

/** Staff-side lead search/filter (1B-01). */
export class QueryLeadsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, phone or email fragment' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: LeadStage })
  @IsEnum(LeadStage)
  @IsOptional()
  stage?: LeadStage;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'UUID of the assigned staff member, or "unassigned"' })
  @Matches(UUID_OR_UNASSIGNED)
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdTo?: string;

  @ApiPropertyOptional({ enum: LEAD_SORTS, default: 'createdAt' })
  @IsIn(LEAD_SORTS)
  @IsOptional()
  sort: LeadSort = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  @Type(() => String)
  order: 'asc' | 'desc' = 'desc';
}

export class AssignLeadDto {
  @ApiPropertyOptional({ description: 'Staff user id; omit to unassign' })
  @IsUUID()
  @IsOptional()
  assignedToId?: string;
}
