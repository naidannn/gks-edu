import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeadStage } from '../../../prisma/client.js';

export class TransitionLeadDto {
  @ApiProperty({ enum: LeadStage })
  @IsEnum(LeadStage)
  stage!: LeadStage;

  @ApiPropertyOptional({ description: 'Required when moving to LOST' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  lostReason?: string;
}
