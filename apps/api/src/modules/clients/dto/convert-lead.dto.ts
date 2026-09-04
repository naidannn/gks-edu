import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsString, Matches } from 'class-validator';
import { CreateClientDto } from './create-client.dto.js';
import { REGISTER_PATTERN, TransformRegister } from './client-fields.js';

/**
 * Lead → client conversion (1B-10). Name, phone, schooling and service interest
 * are copied from the lead, so the form only has to supply what a lead never
 * carries — birth date and register number — plus any correction.
 */
export class ConvertLeadDto extends PartialType(CreateClientDto) {
  @ApiProperty({ example: '2006-04-17' })
  @IsDateString()
  declare birthDate: string;

  @ApiProperty({ example: 'УБ12345678' })
  @TransformRegister()
  @IsString()
  @Matches(REGISTER_PATTERN, { message: 'Регистрийн дугаар буруу байна (жишээ: УБ12345678)' })
  declare registerNumber: string;
}
