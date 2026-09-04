import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { FaqCategory } from '../../../prisma/client.js';

export class UpdateFaqDto {
  @ApiPropertyOptional({ enum: FaqCategory })
  @IsEnum(FaqCategory)
  @IsOptional()
  category?: FaqCategory;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(4)
  @IsOptional()
  question?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @IsOptional()
  answer?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
