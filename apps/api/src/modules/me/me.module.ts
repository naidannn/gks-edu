import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

/** Client-portal API — self-service profile, contract and progress (1B-18, 1C-23, 1G-15). */
@Module({
  imports: [CasesModule, ClientsModule, ContractsModule, DocumentsModule, PricingModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
