import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@gks.edu' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed link' })
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
