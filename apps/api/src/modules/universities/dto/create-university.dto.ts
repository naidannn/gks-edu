import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AccreditationGrade, AgentContractStatus, UniversityType } from '../../../prisma/client.js';
import { MAX_RANK_BOOST } from '../ranking/gks-ranking.math.js';
import { DormitoryDto, UniversityLinksDto } from './university-json.dto.js';

/** Same convention as the importer's slugs and `CreatePostDto`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The current year, plus a little slack for a school announced ahead of time. */
const MAX_FOUNDED_YEAR = new Date().getFullYear() + 1;

/**
 * Staff-entered university (1A-25). Most schools arrive through the importer;
 * this exists for the ones that do not, and it accepts exactly the fields the
 * importer will not overwrite plus the descriptive block editors maintain.
 */
export class CreateUniversityDto {
  @ApiProperty({ example: 'ajou-university' })
  @IsString()
  @Matches(SLUG_PATTERN, { message: 'slug нь латин жижиг үсэг, тоо, зураас агуулна' })
  @MaxLength(160)
  slug!: string;

  @ApiProperty({ example: '아주대학교' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameKo!: string;

  @ApiProperty({ example: 'Ajou University' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameEn!: string;

  @ApiProperty({ example: 'Ажү их сургууль' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameMn!: string;

  @ApiProperty({ enum: UniversityType })
  @IsEnum(UniversityType)
  type!: UniversityType;

  @ApiProperty({ example: 'Suwon' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  cityEn!: string;

  @ApiProperty({ example: 'Сувон' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  cityMn!: string;

  @ApiProperty({ example: 'Gyeonggi' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  regionEn!: string;

  @ApiProperty({ example: 'Гёнги' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  regionMn!: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(MAX_FOUNDED_YEAR)
  @IsOptional()
  foundedYear?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lon?: number | null;

  @ApiPropertyOptional({ description: 'Path under the logo bucket, or /universities/logos/<slug>.png' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  logoPath?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  coverPath?: string | null;

  @ApiPropertyOptional({ description: 'One or two Mongolian sentences for the catalogue card' })
  @IsString()
  @MaxLength(600)
  @IsOptional()
  shortIntroMn?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(8000)
  @IsOptional()
  detailedIntroMn?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  studentsTotal?: number | null;

  @ApiPropertyOptional({ description: 'Unfilled by the importer — the office fills it in' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  internationalStudents?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  mongolianStudents?: number | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  numCampuses?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  campusInfo?: string | null;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2000)
  @IsOptional()
  distanceFromSeoulKm?: number | null;

  @ApiPropertyOptional({ example: 'Метроор 50 минут' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  travelTimeFromSeoul?: string | null;

  @ApiPropertyOptional({ description: 'Nearest metro/bus — unfilled by the importer' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  nearestTransit?: string | null;

  @ApiPropertyOptional({ type: String, isArray: true, description: '3–6 editorial sentences in Mongolian' })
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  @IsOptional()
  advantages?: string[];

  @ApiPropertyOptional({ type: UniversityLinksDto })
  @IsObject()
  @ValidateNested()
  @Type(() => UniversityLinksDto)
  @IsOptional()
  links?: UniversityLinksDto;

  @ApiPropertyOptional({ type: DormitoryDto })
  @IsObject()
  @ValidateNested()
  @Type(() => DormitoryDto)
  @IsOptional()
  dormitory?: DormitoryDto | null;

  // --- Staff-maintained flags; the importer never touches these ---

  @ApiPropertyOptional({
    enum: AccreditationGrade,
    default: AccreditationGrade.NONE,
    description: '교육국제화역량 인증제 tier. Normally written by `pnpm accreditation:import`.',
  })
  @IsEnum(AccreditationGrade)
  @IsOptional()
  accreditation?: AccreditationGrade;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  acceptsLanguagePrep?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  acceptsFromMongolia?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isGksEligible?: boolean;

  @ApiPropertyOptional({ enum: AgentContractStatus, default: AgentContractStatus.NONE })
  @IsEnum(AgentContractStatus)
  @IsOptional()
  agentContractStatus?: AgentContractStatus;

  @ApiPropertyOptional({ description: 'Internal — never returned by a public endpoint' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  commissionNote?: string | null;

  @ApiPropertyOptional({ description: 'Internal — never returned by a public endpoint' })
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  internalNote?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Live on the public catalogue' })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  // --- Ranking (1A-28). `gksScore` / `gksRank` are absent by design: they are
  // computed, and the only handle staff get on them is `gksRankBoost`. ---

  @ApiPropertyOptional({ description: 'THE South Korea Rank; null = рэйтингд ороогүй' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  @IsOptional()
  theKoreaRank?: number | null;

  @ApiPropertyOptional({ example: '251-300', description: 'THE world rank as published — a band, not a number' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  theWorldRank?: string | null;

  @ApiPropertyOptional({ example: 2026, description: 'Edition the two ranks above came from' })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(MAX_FOUNDED_YEAR)
  @IsOptional()
  theRankYear?: number | null;

  @ApiPropertyOptional({
    default: 0,
    description: `Staff nudge to the GKS score, in points (-${MAX_RANK_BOOST} … +${MAX_RANK_BOOST})`,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-MAX_RANK_BOOST)
  @Max(MAX_RANK_BOOST)
  @IsOptional()
  gksRankBoost?: number;

  @ApiPropertyOptional({
    description:
      'Hand-set position, 1 = first. Read while the ranking runs in MANUAL mode; null = let the formula place it',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  gksManualRank?: number | null;
}
