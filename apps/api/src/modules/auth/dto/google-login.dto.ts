import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsJWT, IsOptional, IsString, ValidateNested } from 'class-validator';
import { MetaTrackingDto } from '../../meta/dto/meta-tracking.dto.js';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'The `credential` JWT that Google Identity Services hands the browser.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...',
  })
  @IsString()
  @IsJWT()
  idToken!: string;

  /** Meta ad-click context — Google is the other half of the registration funnel (1A-38). */
  @ApiPropertyOptional({ type: MetaTrackingDto })
  @ValidateNested()
  @Type(() => MetaTrackingDto)
  @IsOptional()
  tracking?: MetaTrackingDto;
}
