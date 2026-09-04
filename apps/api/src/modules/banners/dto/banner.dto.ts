import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { BannerPlacement } from '../../../prisma/client.js';

export class CreateBannerDto {
  @ApiProperty({ enum: BannerPlacement })
  @IsEnum(BannerPlacement)
  placement!: BannerPlacement;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  titleMn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  bodyMn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  // Relative in-site paths are the common case, so a plain string with a
  // length cap rather than `@IsUrl()`.
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  linkLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateBannerDto extends CreateBannerDto {
  @ApiPropertyOptional({ enum: BannerPlacement })
  @IsOptional()
  @IsEnum(BannerPlacement)
  declare placement: BannerPlacement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  declare titleMn: string;
}
