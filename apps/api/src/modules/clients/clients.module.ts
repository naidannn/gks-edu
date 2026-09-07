import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { UsersModule } from '../users/users.module.js';
import { ClientWorkspaceService } from './client-workspace.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

@Module({
  // Correcting a client re-renders the contracts nobody has signed yet (1C-30).
  imports: [CasesModule, ContractsModule, DocumentsModule, UsersModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientWorkspaceService],
  exports: [ClientsService],
})
export class ClientsModule {}
