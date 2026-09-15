import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QPAY_POLL_QUEUE, QPAY_SWEEP_QUEUE, UNPAID_CASE_SWEEP_QUEUE } from '../../queue/queue.constants.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { QpayClientService } from './qpay-client.service.js';
import { QpayPollingProcessor } from './qpay-polling.processor.js';
import { QpaySweepProcessor } from './qpay-sweep.processor.js';
import { UnpaidCaseSweepProcessor } from './unpaid-case-sweep.processor.js';
import { UnpaidCaseSweepService } from './unpaid-case-sweep.service.js';

@Module({
  // `DocumentsModule` — a confirmed prepayment opens the material checklist
  // itself (1D-04), so the client is never left on an empty documents tab.
  // `AdmissionsModule` — the unpaid-case sweep reads its day count from
  // `AdmissionConfig` (1C-43).
  imports: [
    AdmissionsModule,
    CasesModule,
    DocumentsModule,
    PricingModule,
    BullModule.registerQueue({ name: QPAY_POLL_QUEUE }, { name: QPAY_SWEEP_QUEUE }, { name: UNPAID_CASE_SWEEP_QUEUE }),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    QpayClientService,
    QpayPollingProcessor,
    QpaySweepProcessor,
    UnpaidCaseSweepService,
    UnpaidCaseSweepProcessor,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
