import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DOCUMENT_REMINDER_QUEUE } from '../../queue/queue.constants.js';
import { CasesModule } from '../cases/cases.module.js';
import { CaseDocumentsController, DocumentActionsController } from './case-documents.controller.js';
import { CaseDocumentsService } from './case-documents.service.js';
import { ChecklistPdfService } from './checklist-pdf.service.js';
import { ChecklistPrintService } from './checklist-print.service.js';
import { DocumentFilesService } from './document-files.service.js';
import { DocumentRemindersProcessor } from './document-reminders.processor.js';
import { DocumentRemindersService } from './document-reminders.service.js';
import { DocumentTemplatesController } from './document-templates.controller.js';
import { DocumentTemplatesService } from './document-templates.service.js';
import { OfficeAppointmentsService } from './office-appointments.service.js';
import { RequirementsService } from './requirements.service.js';
import { WorkTasksController } from './work-tasks.controller.js';
import { WorkTasksService } from './work-tasks.service.js';

/** 1D — the material requirement engine and everything built on it. */
@Module({
  // `CasesModule` — resolving the admission checklist moves the case on to
  // `DOCUMENTS` itself (1D-04).
  imports: [BullModule.registerQueue({ name: DOCUMENT_REMINDER_QUEUE }), CasesModule],
  controllers: [CaseDocumentsController, DocumentActionsController, DocumentTemplatesController, WorkTasksController],
  providers: [
    RequirementsService,
    CaseDocumentsService,
    ChecklistPdfService,
    ChecklistPrintService,
    DocumentFilesService,
    DocumentTemplatesService,
    DocumentRemindersService,
    DocumentRemindersProcessor,
    OfficeAppointmentsService,
    WorkTasksService,
  ],
  exports: [RequirementsService, CaseDocumentsService],
})
export class DocumentsModule {}
