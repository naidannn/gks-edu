import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { AgentContractStatus, ProgramLevel, UniversityType } from '../../../prisma/client.js';

export const ADMIN_UNIVERSITY_SORTS = ['name', 'city', 'students', 'founded', 'updated', 'created'] as const;
export type AdminUniversitySort = (typeof ADMIN_UNIVERSITY_SORTS)[number];

/** Query strings arrive as "true"/"false"; class-transformer needs the nudge. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;

/**
 * The staff catalogue query. Unlike {@link QueryUniversitiesDto} it is not
 * pinned to `isPublished: true` — an unpublished draft is exactly what the
 * editor came here to find.
 */
export class QueryAdminUniversitiesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Fuzzy search over names, city and slug' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'regionEn, e.g. "Seoul"' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ enum: UniversityType })
  @IsEnum(UniversityType)
  @IsOptional()
  type?: UniversityType;

  @ApiPropertyOptional({ enum: ProgramLevel, description: 'Only schools offering this programme level' })
  @IsEnum(ProgramLevel)
  @IsOptional()
  level?: ProgramLevel;

  @ApiPropertyOptional({ enum: AgentContractStatus })
  @IsEnum(AgentContractStatus)
  @IsOptional()
  agentContractStatus?: AgentContractStatus;

  @ApiPropertyOptional({ description: 'Omit for both; true = live on the site, false = draft' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @ApiPropertyOptional()
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  languagePrep?: boolean;

  @ApiPropertyOptional()
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  gks?: boolean;

  @ApiPropertyOptional({ enum: ADMIN_UNIVERSITY_SORTS, default: 'name' })
  @IsIn(ADMIN_UNIVERSITY_SORTS)
  @IsOptional()
  sort: AdminUniversitySort = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  @Type(() => String)
  order: 'asc' | 'desc' = 'asc';
}
