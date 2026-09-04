import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ProgramLevel } from '../../../prisma/client.js';

/**
 * A programme offered by one university (1A-24). `nameMn` is unique per
 * university and level, so the same faculty can appear at several levels.
 */
export class CreateUniversityProgramDto {
  @ApiProperty({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  level!: ProgramLevel;

  @ApiProperty({ example: 'Компьютерийн ухаан' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameMn!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  nameEn?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  nameKo?: string | null;

  @ApiPropertyOptional({ description: 'Field of study, for filtering: "Инженерчлэл", "Бизнес"…' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  faculty?: string | null;

  @ApiPropertyOptional({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(10)
  @IsOptional()
  durationYears?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  tuitionPerYearKrw?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200_000_000)
  @IsOptional()
  tuitionPerTermKrw?: number | null;

  @ApiPropertyOptional({ description: 'Minimum TOPIK level for admission (1–6)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  @IsOptional()
  topikLevel?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsOptional()
  ieltsScore?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  otherRequirements?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class UpdateUniversityProgramDto extends PartialType(CreateUniversityProgramDto) {}
