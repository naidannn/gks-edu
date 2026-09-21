import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export const CATALOGUE_PROGRESS_PERIODS = [7, 30, 90, 365] as const;

/** `GET /admin/universities/progress` — how far back the staff activity reaches. */
export class QueryCatalogueProgressDto {
  @ApiPropertyOptional({ enum: CATALOGUE_PROGRESS_PERIODS, default: 30, description: 'Days of staff activity' })
  @Type(() => Number)
  @IsIn(CATALOGUE_PROGRESS_PERIODS)
  @IsOptional()
  days?: (typeof CATALOGUE_PROGRESS_PERIODS)[number];
}
