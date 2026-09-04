import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PostStatus } from '../../../prisma/client.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdatePostDto {
  @ApiPropertyOptional()
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug нь латин жижиг үсэг, тоо, зураас агуулна' })
  @MaxLength(160)
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(400)
  @IsOptional()
  excerpt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @IsOptional()
  content?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  coverImagePath?: string;

  @ApiPropertyOptional({ enum: PostStatus })
  @IsEnum(PostStatus)
  @IsOptional()
  status?: PostStatus;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(400)
  @IsOptional()
  seoDescription?: string;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @IsOptional()
  tags?: string[];
}
