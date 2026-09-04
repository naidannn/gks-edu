import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ContractPdfService } from './contract-pdf.service.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';

@Module({
  imports: [CasesModule, PricingModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractPdfService],
  exports: [ContractsService],
})
export class ContractsModule {}
