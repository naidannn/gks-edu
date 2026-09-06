import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ProgramLevel } from '../../../prisma/client.js';

/** `POST /admin/programs/research` — queues one Gemini lookup of a school's programmes. */
export class StartProgramResearchDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;

  @ApiProperty({ example: 2026, description: 'Academic year the tuition is asked for' })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({ enum: ProgramLevel, isArray: true, description: 'Empty or omitted = every level' })
  @IsArray()
  @ArrayMaxSize(4)
  @IsEnum(ProgramLevel, { each: true })
  @IsOptional()
  levels?: ProgramLevel[];
}
