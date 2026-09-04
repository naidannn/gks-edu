import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * The two JSON blobs staff are allowed to edit. `livingCost` and `quality` are
 * deliberately absent: the first is a regional estimate and the second is the
 * importer's own provenance record — neither is a hand-edited field.
 */
export class UniversityLinksDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  officialWebsite?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  wikipedia?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  wikidata?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  coverUrl?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  googleMaps?: string | null;
}

/**
 * Dormitory facts. Unfilled by design in the imported dataset (CLAUDE.md), so
 * this is the block the office fills in by hand after asking the school.
 * `null` stays meaningful — it renders as "мэдээлэл шинэчлэгдэж байна".
 */
export class DormitoryDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  available?: boolean | null;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @IsOptional()
  roomTypes?: string[] | null;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  pricePerMonthKrw?: number | null;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  pricePerSemesterKrw?: number | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  mealIncluded?: boolean | null;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  depositKrw?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(600)
  @IsOptional()
  note?: string | null;
}
