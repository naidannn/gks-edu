import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class RegisterPhysicalContractDto {
  @ApiProperty({ description: 'When the paper contract was actually signed' })
  @IsDateString()
  signedAt!: string;
}
