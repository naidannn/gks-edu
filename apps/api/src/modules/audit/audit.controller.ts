import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { Role } from '../../prisma/client.js';
import { AuditService } from './audit.service.js';

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsUUID() actorId?: string;
  /** Prefix match, so `case.` returns every case action. */
  @IsOptional() @IsString() action?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Аудитын бүртгэл (зөвхөн ADMIN)' })
  list(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}
