import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role, type ServiceType } from '../../prisma/client.js';
import { CreateServicePricingDto } from './dto/create-service-pricing.dto.js';
import { PricingService } from './pricing.service.js';

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @Roles(Role.ADMIN, Role.CONSULTANT)
  @ApiOperation({ summary: 'Price history, optionally filtered by service (1C-19)' })
  list(@Query('serviceType') serviceType?: ServiceType) {
    return this.pricing.list(serviceType);
  }

  @Get('active')
  @Roles(Role.ADMIN, Role.CONSULTANT)
  @ApiOperation({ summary: 'The pricing currently in effect for one service' })
  getActive(@Query('serviceType') serviceType: ServiceType) {
    return this.pricing.getActive(serviceType);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Version in a new price/prepayment configuration (1C-19)' })
  create(@Body() dto: CreateServicePricingDto) {
    return this.pricing.create(dto);
  }
}
