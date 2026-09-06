import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { UsersModule } from '../users/users.module.js';
import { ClientWorkspaceService } from './client-workspace.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [CasesModule, DocumentsModule, UsersModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientWorkspaceService],
  exports: [ClientsService],
})
export class ClientsModule {}
