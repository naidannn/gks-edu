import { PartialType } from '@nestjs/swagger';
import { CreateUniversityDto } from './create-university.dto.js';

/**
 * Every field of {@link CreateUniversityDto}, all optional — a staff edit is a
 * patch, not a re-entry of the whole record.
 *
 * `PartialType` marks each property `@IsOptional()`, which also lets an explicit
 * `null` through. That is what we want for the nullable columns ("this number is
 * unknown again") but it would break the NOT NULL ones, so the service rejects a
 * null for those; see `NON_NULLABLE_FIELDS` in `admin-universities.service.ts`.
 */
export class UpdateUniversityDto extends PartialType(CreateUniversityDto) {}
