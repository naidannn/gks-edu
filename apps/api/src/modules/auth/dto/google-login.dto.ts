import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'The `credential` JWT that Google Identity Services hands the browser.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...',
  })
  @IsString()
  @IsJWT()
  idToken!: string;
}
