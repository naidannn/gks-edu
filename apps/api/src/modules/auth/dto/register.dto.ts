import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { MetaTrackingDto } from '../../meta/dto/meta-tracking.dto.js';

export class RegisterDto {
  @ApiProperty({ example: 'student@gks.edu' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiPropertyOptional({ example: 'Bat Dorj' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  /** Meta ad-click context — a registration is a conversion (1A-38). */
  @ApiPropertyOptional({ type: MetaTrackingDto })
  @ValidateNested()
  @Type(() => MetaTrackingDto)
  @IsOptional()
  tracking?: MetaTrackingDto;
}
