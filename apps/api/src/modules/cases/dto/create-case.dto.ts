import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { ServiceType } from '../../../prisma/client.js';
import { UniversityChoiceDto } from './university-choice.dto.js';

export class CreateCaseDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  programId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  intakeId?: string;

  /**
   * Every school the client picked, in preference order. `universityId` above
   * is a shorthand for a single-school list and is ignored when this is sent.
   */
  @ApiPropertyOptional({ type: [UniversityChoiceDto] })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => UniversityChoiceDto)
  @IsOptional()
  universityChoices?: UniversityChoiceDto[];
}
