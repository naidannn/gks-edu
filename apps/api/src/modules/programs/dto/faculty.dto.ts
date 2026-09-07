import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Танхим — one college of one university (단과대학).
 *
 * The Korean name is the useful one: it is what the prospectus prints and what
 * staff match a research run against. `nameMn` is ours and is what the list
 * shows, so it is the only required one.
 */
export class CreateFacultyDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;

  @ApiProperty({ example: 'Инженерийн танхим' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameMn!: string;

  @ApiPropertyOptional({ example: 'College of Engineering' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  nameEn?: string | null;

  @ApiPropertyOptional({ example: '공과대학' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  nameKo?: string | null;

  @ApiPropertyOptional({ description: 'Order inside the school; ties fall back to the name', default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  sortOrder?: number;
}

/** The school comes from the path on an update; it is never moved. */
export class UpdateFacultyDto extends PartialType(OmitType(CreateFacultyDto, ['universityId'] as const)) {}
