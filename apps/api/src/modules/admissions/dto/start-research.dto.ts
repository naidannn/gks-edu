import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ProgramLevel } from '../../../prisma/client.js';

/** `POST /admin/admissions/research` — queues one Gemini lookup (1H-10). */
export class StartIntakeResearchDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;

  @ApiProperty({ example: 2027, description: 'Calendar year of the intakes to look for' })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({
    enum: ProgramLevel,
    isArray: true,
    description: 'Empty or omitted = every level',
  })
  @IsArray()
  @ArrayMaxSize(4)
  @IsEnum(ProgramLevel, { each: true })
  @IsOptional()
  levels?: ProgramLevel[];
}
