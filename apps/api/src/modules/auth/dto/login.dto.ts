import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { TransformEmail } from '../../../common/validation/transforms.js';

export class LoginDto {
  @ApiProperty({ example: 'student@gks.edu' })
  @TransformEmail()
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
