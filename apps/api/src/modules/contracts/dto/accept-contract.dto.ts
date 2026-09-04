import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class AcceptContractDto {
  @ApiProperty({ description: 'Mongolian mobile number the OTP is sent to' })
  @IsString()
  @Matches(/^(976)?\d{8}$/, { message: 'Утасны дугаар буруу байна' })
  phone!: string;
}
