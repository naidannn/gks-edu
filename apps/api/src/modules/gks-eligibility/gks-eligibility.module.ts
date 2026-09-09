import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module.js';
import { GksEligibilityController } from './gks-eligibility.controller.js';
import { GksEligibilityService } from './gks-eligibility.service.js';

/**
 * The GKS self-check (ARCHITECTURE.md §3.5).
 *
 * A leaf with one dependency: the guideline's rules are its own, and the only
 * thing it reads from the database is what our two services cost — because
 * those are configuration, never constants (`gksedu.md` §5.4).
 */
@Module({
  imports: [PricingModule],
  controllers: [GksEligibilityController],
  providers: [GksEligibilityService],
})
export class GksEligibilityModule {}
