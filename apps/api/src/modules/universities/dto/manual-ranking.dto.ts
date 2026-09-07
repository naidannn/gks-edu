import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/**
 * A ceiling, not a business rule: the catalogue holds 135 schools and the
 * ordering screen sends all of them, so anything past a few hundred is a bug
 * or an attempt to make the server sort a phone book.
 */
const MAX_ORDERED = 1000;

/**
 * 1A-35 — the order staff dragged the catalogue into.
 *
 * The array is the whole catalogue, top first. Positions are derived from the
 * index rather than sent, so there is no way to submit a list with two schools
 * on the same number or a gap in the middle.
 */
export class ReorderManualRankingDto {
  @ApiProperty({
    type: [String],
    description: 'Every university id, in the order they should appear (first = position 1)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDERED)
  @IsUUID('4', { each: true })
  order!: string[];
}
