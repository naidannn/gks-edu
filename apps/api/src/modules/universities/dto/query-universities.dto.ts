import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { ProgramLevel, UniversityType } from '../../../prisma/client.js';

export const UNIVERSITY_SORTS = ['name', 'students', 'founded', 'city'] as const;
export type UniversitySort = (typeof UNIVERSITY_SORTS)[number];

/** Query strings arrive as "true"/"false"; class-transformer needs the nudge. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;

export class QueryUniversitiesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Fuzzy search over Mongolian/English/Korean names and city' })
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

  @ApiPropertyOptional({ description: 'Only schools that take language-prep students' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  languagePrep?: boolean;

  @ApiPropertyOptional({ description: 'Only schools eligible for the GKS scholarship' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  gks?: boolean;

  @ApiPropertyOptional({ enum: UNIVERSITY_SORTS, default: 'name' })
  @IsIn(UNIVERSITY_SORTS)
  @IsOptional()
  sort: UniversitySort = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  @Type(() => String)
  order: 'asc' | 'desc' = 'asc';
}
