import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CaseStage } from '../../../prisma/client.js';

export class TransitionCaseDto {
  @ApiProperty({ enum: CaseStage })
  @IsEnum(CaseStage)
  toStage!: CaseStage;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;
}
