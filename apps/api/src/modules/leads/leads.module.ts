import { Module } from '@nestjs/common';
import { ConsultationAppointmentsController } from './consultation-appointments.controller.js';
import { ConsultationAppointmentsService } from './consultation-appointments.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController, ConsultationAppointmentsController],
  providers: [LeadsService, ConsultationAppointmentsService],
  exports: [LeadsService, ConsultationAppointmentsService],
})
export class LeadsModule {}
