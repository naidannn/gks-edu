import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { FxModule } from '../fx/fx.module.js';
import { VisaModule } from '../visa/visa.module.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { SchoolInvoicesService } from './school-invoices.service.js';

/** 1E — school application, tuition invoice, invitation. */
@Module({
  imports: [CasesModule, DocumentsModule, FxModule, VisaModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, SchoolInvoicesService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
