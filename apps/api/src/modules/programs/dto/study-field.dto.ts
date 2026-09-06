import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { toBoolean } from './university-program.dto.js';

export class CreateStudyFieldDto {
  @ApiProperty({ example: 'marketing' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug зөвхөн жижиг латин үсэг, тоо, зураас агуулна.' })
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @ApiProperty({ example: 'Маркетинг' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameMn!: string;

  @ApiProperty({ example: 'Marketing' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn!: string;

  @ApiPropertyOptional({ example: '마케팅' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  nameKo?: string | null;

  @ApiPropertyOptional({
    isArray: true,
    type: String,
    description: 'Every other wording seen for this subject. Adding one here is how the matcher learns.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @IsOptional()
  aliases?: string[];

  @ApiPropertyOptional({ description: 'The group this subject sits in. Null on a group itself.' })
  @IsUUID()
  @IsOptional()
  parentId?: string | null;

  @ApiPropertyOptional({ default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateStudyFieldDto extends PartialType(CreateStudyFieldDto) {}

/**
 * "These programmes are all this subject." Files a hand-picked set under one
 * field and — when asked — remembers their wording as aliases, so the next
 * school that words it the same way is matched without anyone being asked.
 */
export class AssignStudyFieldDto {
  @ApiProperty({ isArray: true, type: String })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  programIds!: string[];

  @ApiPropertyOptional({
    default: false,
    description: "Also learn each programme's Korean/English name as an alias of this field",
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  learnAliases?: boolean;
}

/** `POST /admin/study-fields/rematch` — re-runs the matcher over the catalogue. */
export class RematchStudyFieldsDto {
  @ApiPropertyOptional({ default: true, description: 'Report what would change and write nothing' })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Also revisit programmes that already carry a subject. Off by default: a human filed those.',
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  includeClassified?: boolean;
}
