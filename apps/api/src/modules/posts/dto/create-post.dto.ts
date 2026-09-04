import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

/** URL-safe slug: lowercase letters/digits/hyphens, matching the university importer's convention. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreatePostDto {
  @ApiProperty({ example: 'gks-tetgelgiin-materialiin-jagsaalt-2027' })
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug нь латин жижиг үсэг, тоо, зураас агуулна' })
  @MaxLength(160)
  slug!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(400)
  @IsOptional()
  excerpt?: string;

  @ApiProperty({ description: 'Sanitized HTML rendered as the article body' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  coverImagePath?: string;

  @ApiPropertyOptional({ enum: PostStatus, default: PostStatus.DRAFT })
  @IsEnum(PostStatus)
  @IsOptional()
  status?: PostStatus;

  @ApiPropertyOptional({ description: 'Defaults to now() when status flips to PUBLISHED without one' })
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
