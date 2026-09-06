import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { UniversityChoiceDto } from './university-choice.dto.js';

/** The case's whole school list, replacing whatever it holds now (§5.1). */
export class ReplaceUniversityChoicesDto {
  @ApiProperty({ type: [UniversityChoiceDto] })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => UniversityChoiceDto)
  universityChoices!: UniversityChoiceDto[];
}
