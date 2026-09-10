import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TransformEmail } from '../../../common/validation/transforms.js';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@gks.edu' })
  @TransformEmail()
  @IsEmail()
  @MaxLength(200)
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

/**
 * Changing your own password while signed in. `currentPassword` is optional
 * only because an account that has never had one — a Google sign-in, or a
 * staff-created row — has nothing to prove; the service demands it the moment
 * a password exists.
 */
export class ChangePasswordDto {
  @ApiPropertyOptional({ minLength: 8, maxLength: 72 })
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
