import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { InstructionLanguage, ProgramLevel, UniversityType } from '../../../prisma/client.js';
import { toBoolean } from './university-program.dto.js';

/**
 * `tuition` first among the price sorts: this whole module exists so somebody
 * can answer "which school teaches marketing, and what does it cost?" — and
 * the second half of that question is a sort, not a filter.
 */
export const PROGRAM_SORTS = ['university', 'tuition', 'name', 'topik', 'duration'] as const;
export type ProgramSort = (typeof PROGRAM_SORTS)[number];

export class QueryProgramsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Free text over the programme's three names and the school" })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({
    description: 'Canonical subject slug — "marketing". A group slug matches every subject inside it.',
  })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  field?: string;

  @ApiPropertyOptional({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  @IsOptional()
  level?: ProgramLevel;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({ description: 'regionEn, e.g. "Seoul"' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ enum: UniversityType })
  @IsEnum(UniversityType)
  @IsOptional()
  type?: UniversityType;

  @ApiPropertyOptional({ enum: InstructionLanguage })
  @IsEnum(InstructionLanguage)
  @IsOptional()
  language?: InstructionLanguage;

  @ApiPropertyOptional({ description: 'Annual tuition at most this many KRW' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  tuitionMax?: number;

  @ApiPropertyOptional({ description: 'Annual tuition at least this many KRW' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  tuitionMin?: number;

  @ApiPropertyOptional({ description: 'Only programmes asking TOPIK this level or lower (unset counts as open)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  @IsOptional()
  topikMax?: number;

  @ApiPropertyOptional({ description: 'Only schools eligible for the GKS scholarship' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  gks?: boolean;

  @ApiPropertyOptional({ enum: PROGRAM_SORTS, default: 'university' })
  @IsIn(PROGRAM_SORTS)
  @IsOptional()
  sort: ProgramSort = 'university';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  order: 'asc' | 'desc' = 'asc';
}

/**
 * The staff list. Drafts, unclassified rows and unverified tuition are the
 * point of this screen, so it gets the three filters the public one has no use
 * for.
 */
export class QueryAdminProgramsDto extends QueryProgramsDto {
  @ApiPropertyOptional({ description: 'Only programmes not yet filed under a canonical subject' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  unclassified?: boolean;

  @ApiPropertyOptional({ description: 'Only programmes with no tuition figure at all' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  missingTuition?: boolean;

  @ApiPropertyOptional({ description: 'Only programmes nobody has checked against the school' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  unverified?: boolean;

  @ApiPropertyOptional({ description: 'true = published only, false = drafts only' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  published?: boolean;
}
