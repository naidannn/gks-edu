import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { DepartureModule } from '../departure/departure.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { VisaController } from './visa.controller.js';
import { VisaService } from './visa.service.js';

/** 1F — visa case and its paperwork. */
@Module({
  imports: [CasesModule, DocumentsModule, DepartureModule],
  controllers: [VisaController],
  providers: [VisaService],
  exports: [VisaService],
})
export class VisaModule {}
