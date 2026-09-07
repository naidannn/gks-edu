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
  @ApiPropertyOptional({
    description: "Free text over the programme's three names, its college and its school — the way in",
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'University slug — the "just this school" cut' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  university?: string;

  @ApiPropertyOptional({ description: 'One college of one school (단과대학)' })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

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

  /**
   * "Is there a scholarship?" is the third question every enquiry asks, right
   * after "where" and "what does it cost". A programme whose discount we have
   * not recorded is not thereby without one — so this narrows to the ones we
   * can actually promise, and is never inverted into "these have none".
   */
  @ApiPropertyOptional({ description: 'Only programmes with a recorded discount for foreign students' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  scholarship?: boolean;

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
  @ApiPropertyOptional({ description: 'Only programmes not filed under any college yet' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  noFaculty?: boolean;

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
