import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ConsultationAppointmentsService } from './consultation-appointments.service.js';
import {
  CreateConsultationAppointmentDto,
  QueryConsultationCalendarDto,
  UpdateConsultationAppointmentDto,
} from './dto/consultation-appointment.dto.js';

/** 1B-30 — the consultation calendar. CRM work, so the CRM roles. */
@ApiTags('consultation-appointments')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('consultation-appointments')
export class ConsultationAppointmentsController {
  constructor(private readonly appointments: ConsultationAppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Зөвлөгөөний цаг + оффисын уулзалт, хугацааны мужаар, ажлын цагийн хамт (1B-30)' })
  calendar(@Query() query: QueryConsultationCalendarDto) {
    return this.appointments.calendar(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'consultation_appointment.create', entity: 'ConsultationAppointment' })
  @ApiOperation({ summary: 'Ажилтан зөвлөгөөний цаг нэмэх (1B-30)' })
  create(@Body() dto: CreateConsultationAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.create(dto, user);
  }

  @Patch(':id')
  @Audit({ action: 'consultation_appointment.update', entity: 'ConsultationAppointment' })
  @ApiOperation({ summary: 'Цагийг шилжүүлэх, зөвлөх солих, үр дүнг бүртгэх (1B-30)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateConsultationAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'consultation_appointment.delete', entity: 'ConsultationAppointment' })
  @ApiOperation({ summary: 'Буруу нэмсэн цагийг устгах (1B-30)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.remove(id);
  }
}
