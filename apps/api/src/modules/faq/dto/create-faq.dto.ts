import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { FaqCategory } from '../../../prisma/client.js';

export class CreateFaqDto {
  @ApiProperty({ enum: FaqCategory })
  @IsEnum(FaqCategory)
  category!: FaqCategory;

  @ApiProperty()
  @IsString()
  @MinLength(4)
  question!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  answer!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
