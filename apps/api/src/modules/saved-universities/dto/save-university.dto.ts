import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SaveUniversityDto {
  @ApiProperty()
  @IsUUID()
  universityId!: string;
}
