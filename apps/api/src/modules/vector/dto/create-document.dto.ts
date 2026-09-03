import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({ example: 'Linear algebra — lecture 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ example: 'syllabus-2026.pdf' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({
    description: 'Text chunks to embed and store. One vector row is written per chunk.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  chunks!: string[];

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
