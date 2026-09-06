import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CaseChoiceTrack } from '../../../prisma/client.js';

/**
 * One school on a case's choice list. How many of these a case may carry, and
 * on which track, is `university-choice.rules.ts` — the DTO only describes one
 * row, because the limits depend on the case's service type.
 */
export class UniversityChoiceDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional({
    enum: CaseChoiceTrack,
    description: 'Defaults to SCHOLARSHIP on a GKS case, REGULAR everywhere else.',
  })
  @IsEnum(CaseChoiceTrack)
  @IsOptional()
  track?: CaseChoiceTrack;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  major?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}
