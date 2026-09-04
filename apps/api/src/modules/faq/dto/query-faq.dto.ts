import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FaqCategory } from '../../../prisma/client.js';

export class QueryFaqDto {
  @ApiPropertyOptional({ enum: FaqCategory })
  @IsEnum(FaqCategory)
  @IsOptional()
  category?: FaqCategory;
}
