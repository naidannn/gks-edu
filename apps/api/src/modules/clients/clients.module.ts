import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [CasesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
