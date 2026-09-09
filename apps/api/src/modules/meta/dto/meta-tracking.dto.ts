import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Meta ad-click context, carried on the requests that are themselves
 * conversions (1A-38). Mirrors `metaTrackingSchema` in `packages/shared` —
 * keep both in step when a field changes.
 *
 * None of it is trusted for anything but analytics: it never reaches the
 * database and never influences a business decision.
 */
export class MetaTrackingDto {
  /** The id the browser's pixel used for the same conversion, so Meta counts it once. */
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  eventId?: string;

  @ApiPropertyOptional({ description: "Meta's browser cookie (`_fbp`)" })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  fbp?: string;

  @ApiPropertyOptional({ description: "Meta's click cookie (`_fbc`)" })
  @IsString()
  @MaxLength(400)
  @IsOptional()
  fbc?: string;

  @ApiPropertyOptional({ description: 'Our first-party visitor id (`gks_eid`)' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  externalId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  eventSourceUrl?: string;
}
