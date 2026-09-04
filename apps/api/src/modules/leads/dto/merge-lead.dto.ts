import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** 1B-09 — the lead being folded *into* the one named in the route. */
export class MergeLeadDto {
  @ApiProperty({ description: 'Нэгтгэгдэж алга болох (давхардсан) сэжмийн ID' })
  @IsUUID()
  sourceId!: string;
}
