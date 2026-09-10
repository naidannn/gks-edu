import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { AccreditationGrade, ProgramLevel, UniversityType } from '../../../prisma/client.js';
import { toBoolean } from '../../programs/dto/university-program.dto.js';

/** `gks` first: it is the default order of the whole catalogue (1A-30). */
export const UNIVERSITY_SORTS = ['gks', 'rank', 'name', 'students', 'founded', 'city'] as const;
export type UniversitySort = (typeof UNIVERSITY_SORTS)[number];

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

  @ApiPropertyOptional({
    enum: AccreditationGrade,
    description: "Only schools at this Ministry of Education certification tier (EXCELLENT = 우수인증대학)",
  })
  @IsEnum(AccreditationGrade)
  @IsOptional()
  accreditation?: AccreditationGrade;

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

  @ApiPropertyOptional({
    enum: UNIVERSITY_SORTS,
    default: 'gks',
    description: 'gks = our recommendation order, rank = THE South Korea rank',
  })
  @IsIn(UNIVERSITY_SORTS)
  @IsOptional()
  sort: UniversitySort = 'gks';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  @Type(() => String)
  order: 'asc' | 'desc' = 'asc';
}
