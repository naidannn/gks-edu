import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class SearchDto {
  @ApiProperty({ example: 'How do eigenvalues work?' })
  @IsString()
  @MinLength(1)
  query!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 5;

  @ApiPropertyOptional({
    description: 'Drop results below this cosine similarity (0–1).',
    minimum: 0,
    maximum: 1,
    default: 0,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  minSimilarity: number = 0;
}
