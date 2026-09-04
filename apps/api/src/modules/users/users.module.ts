import { Module } from '@nestjs/common';
import { AccountClaimService } from './account-claim.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AccountClaimService],
  exports: [UsersService, AccountClaimService],
})
export class UsersModule {}
