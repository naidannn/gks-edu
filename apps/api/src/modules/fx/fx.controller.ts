import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../prisma/client.js';
import { FxService } from './fx.service.js';

@ApiTags('fx-rates')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('fx-rates')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('current')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Today`s MNT-per-KRW rate used to price a school invoice (1E-07)' })
  current(@Query('currency') currency?: string) {
    return this.fx.current(currency ?? 'KRW');
  }

  @Get()
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Recent rate history' })
  list(@Query('currency') currency?: string) {
    return this.fx.list(currency ?? 'KRW');
  }

  @Post('refresh')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Pull the rate from Mongolbank now instead of waiting for the daily job' })
  refresh() {
    return this.fx.refreshFromMongolbank();
  }
}
