import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../../prisma/client.js';

/** Staff roles an admin may hand out — never `USER`, which is what clients are. */
const ASSIGNABLE_ROLES = [Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER] as const;

/** An address pasted out of a chat arrives padded and capitalised; `@IsEmail` rejects both. */
const TrimEmail = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class CreateStaffDto {
  @ApiProperty()
  @TrimEmail()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 72,
    description:
      'Нууц үгийг админ шууд тохоовол хэрэглэгч тэр дороо нэвтэрнэ. Хоосон бол бүртгэл нууц үггүй үүсэж, урилгаар идэвхжинэ (1B-17).',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @TrimEmail()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** An admin setting or resetting someone else's password (1G-12). */
export class SetStaffPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class ClaimAccountDto {
  @ApiProperty({ description: 'Урилгын холбоосны токен' })
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export { ASSIGNABLE_ROLES };
