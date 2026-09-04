import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeadActivityType } from '../../../prisma/client.js';

export class CreateLeadActivityDto {
  @ApiProperty({ enum: LeadActivityType, description: 'STAGE_CHANGE is system-generated only — use the transitions endpoint' })
  @IsEnum(LeadActivityType)
  type!: LeadActivityType;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  body?: string;

  @ApiPropertyOptional({ description: 'When it actually happened, if not now (a logged past call, say)' })
  @IsDateString()
  @IsOptional()
  occurredAt?: string;

  @ApiPropertyOptional({ description: 'Type-specific payload: call duration, channel …' })
  @IsObject()
  @IsOptional()
  meta?: Record<string, unknown>;
}
