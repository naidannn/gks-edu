import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ClientsService } from './clients.service.js';
import { ConvertLeadDto } from './dto/convert-lead.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { QueryClientsDto } from './dto/query-clients.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a client directly, without a lead (1B-14)' })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.create(dto, user.id);
  }

  @Post('from-lead/:leadId')
  @ApiOperation({ summary: 'Convert a consulted lead into a client (1B-10)' })
  createFromLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.createFromLead(leadId, dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List/search clients with their brokerage stage (1B-14)' })
  findAll(@Query() query: QueryClientsDto) {
    return this.clients.findAllStaff(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Client counters for the list header' })
  stats() {
    return this.clients.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One client with every case, contract and origin lead' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Edit a client's own fields" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }
}
