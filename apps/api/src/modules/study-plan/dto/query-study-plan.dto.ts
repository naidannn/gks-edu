import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { EducationLevel, ProgramLevel } from '../../../prisma/client.js';

/**
 * The whole planner input — four questions the visitor taps through, and two
 * more the result page sets from its own chips.
 *
 * It is a query rather than a body on purpose: the plan is then a link, which
 * is how a consultant sends one to a client and how a visitor gets theirs back
 * after a reload.
 */
export class QueryStudyPlanDto {
  @ApiProperty({ enum: EducationLevel, description: 'The diploma the visitor already holds' })
  @IsEnum(EducationLevel)
  education!: EducationLevel;

  @ApiProperty({ enum: ProgramLevel, description: 'What they want to study in Korea' })
  @IsEnum(ProgramLevel)
  goal!: ProgramLevel;

  @ApiPropertyOptional({ description: 'TOPIK level held; 0 = no Korean at all', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  topik = 0;

  /**
   * A word, not a slug: "IT", "маркетинг", "경영". Matched against the same
   * columns `/programs` searches, so the plan and the catalogue it links to
   * always agree about how many programmes exist. `any` means the wizard's
   * "хараахан шийдээгүй" and matches everything.
   */
  @ApiPropertyOptional({ description: 'Subject keyword; unset or "any" = хараахан шийдээгүй' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  field?: string;

  @ApiPropertyOptional({ description: 'regionEn, e.g. "Seoul" — the region chips on the result' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ description: 'Annual tuition ceiling in KRW — the budget chips on the result' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  budget?: number;
}
