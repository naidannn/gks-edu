import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { CreateProgramDto } from './university-program.dto.js';

/** One reviewed candidate, ready to save. The school comes from the envelope. */
export class BulkProgramEntryDto extends OmitType(CreateProgramDto, ['universityId'] as const) {}

/**
 * `POST /admin/programs/bulk` — the save at the end of a research run.
 *
 * The list is what a human ticked, not what the model returned: the run
 * proposes, the reviewer chooses, and only the chosen rows arrive here. That
 * split is the whole safety property of the LLM path (CLAUDE.md, 1H-10).
 */
export class BulkCreateProgramsDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;

  @ApiProperty({ type: [BulkProgramEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => BulkProgramEntryDto)
  programs!: BulkProgramEntryDto[];

  @ApiPropertyOptional({ description: 'The run these came off, so it can record how many were accepted' })
  @IsUUID()
  @IsOptional()
  researchRunId?: string;
}
