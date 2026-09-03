import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { CreatePublicLeadDto } from './dto/create-public-lead.dto.js';
import { LeadsService } from './leads.service.js';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post('public')
  @Public()
  // The public form is the one endpoint an anonymous visitor can write through,
  // so it gets a tighter limit than the global 120/min.
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Consultation request from the public website' })
  createPublic(@Body() dto: CreatePublicLeadDto) {
    return this.leads.createFromPublicForm(dto);
  }
}
