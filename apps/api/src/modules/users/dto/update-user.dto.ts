import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { TransformEmail } from '../../../common/validation/transforms.js';

export class UpdateUserDto {
  /**
   * Admin-only, and the controller refuses it from anyone else (1N-03). The
   * address is the account's identity — `login`, the password reset and the
   * Google link all match on it — so a client setting their own would be
   * claiming an inbox nobody has checked they own.
   */
  @ApiPropertyOptional({ description: 'Зөвхөн админ солино' })
  @TransformEmail()
  @IsEmail()
  @MaxLength(200)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;
}

/**
 * `GET /users` (admin). `search` used to be a bare `@Query('search')` next to a
 * `PaginationQueryDto`, and the global whitelist rejects any key the validated
 * DTO does not declare — so the branch implementing it was unreachable.
 */
export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Нэр эсвэл имэйлийн хэсэг' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}
