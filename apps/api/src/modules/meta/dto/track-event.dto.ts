import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { META_CUSTOM_EVENTS, META_STANDARD_EVENTS } from '../meta-capi.types.js';

const ALLOWED_EVENTS: string[] = [...META_STANDARD_EVENTS, ...META_CUSTOM_EVENTS];

/**
 * The `custom_data` a browser may set. Deliberately a closed list rather than a
 * pass-through object: this endpoint is public, and anything that reaches Meta
 * unchecked is a field somebody else can write into our dataset.
 */
export class TrackCustomDataDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  content_name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  content_category?: string;

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @IsOptional()
  content_ids?: string[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  content_type?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search_string?: string;

  /** Capped: a browser-declared value is a hint, and an absurd one distorts ROAS. */
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ example: 'MNT' })
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;
}

export class TrackEventDto {
  @ApiProperty({ enum: ALLOWED_EVENTS })
  @IsIn(ALLOWED_EVENTS, { message: 'Дэмжигдээгүй үйл явдал' })
  eventName!: string;

  /** The id the pixel used for the same event, so Meta counts the two as one. */
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  eventId!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  eventSourceUrl?: string;

  /** Meta's own browser cookies — identifiers, not personal data. */
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  fbp?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(400)
  @IsOptional()
  fbc?: string;

  /** Our own first-party visitor id (`gks_eid`), hashed before it is sent on. */
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  externalId?: string;

  @ApiPropertyOptional({ type: TrackCustomDataDto })
  @ValidateNested()
  @Type(() => TrackCustomDataDto)
  @IsOptional()
  customData?: TrackCustomDataDto;
}
