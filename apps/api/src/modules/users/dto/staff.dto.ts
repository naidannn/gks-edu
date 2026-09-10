import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DOC_STAFF_ROLES } from '../../../common/constants/roles.js';
import { TransformEmail } from '../../../common/validation/transforms.js';
import { Role } from '../../../prisma/client.js';

/** Staff roles an admin may hand out — never `USER`, which is what clients are. */
const ASSIGNABLE_ROLES = [...DOC_STAFF_ROLES];

export class CreateStaffDto {
  @ApiProperty()
  @TransformEmail()
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
  @TransformEmail()
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

/**
 * Re-sending a claim invitation (1B-17, 1N-01). The address is an override and
 * an admin-only one: it decides where a link that grants the account goes, so a
 * consultant sends the invitation to the address already on the row or not at
 * all. A body was read straight off `@Body('email')` before this class existed,
 * which made a non-string a 500.
 */
export class ClaimInviteDto {
  @ApiPropertyOptional({ description: 'Урилга илгээх хаягийг солих — зөвхөн админ' })
  @IsOptional()
  @TransformEmail()
  @IsEmail()
  @MaxLength(200)
  email?: string;
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
