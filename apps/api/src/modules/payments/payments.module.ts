import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QPAY_POLL_QUEUE } from '../../queue/queue.constants.js';
import { CasesModule } from '../cases/cases.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { QpayClientService } from './qpay-client.service.js';
import { QpayPollingProcessor } from './qpay-polling.processor.js';

@Module({
  imports: [CasesModule, PricingModule, BullModule.registerQueue({ name: QPAY_POLL_QUEUE })],
  controllers: [PaymentsController],
  providers: [PaymentsService, QpayClientService, QpayPollingProcessor],
  exports: [PaymentsService],
})
export class PaymentsModule {}
