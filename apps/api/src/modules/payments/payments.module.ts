import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QPAY_POLL_QUEUE, QPAY_SWEEP_QUEUE } from '../../queue/queue.constants.js';
import { CasesModule } from '../cases/cases.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { QpayClientService } from './qpay-client.service.js';
import { QpayPollingProcessor } from './qpay-polling.processor.js';
import { QpaySweepProcessor } from './qpay-sweep.processor.js';

@Module({
  imports: [
    CasesModule,
    PricingModule,
    BullModule.registerQueue({ name: QPAY_POLL_QUEUE }, { name: QPAY_SWEEP_QUEUE }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, QpayClientService, QpayPollingProcessor, QpaySweepProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
