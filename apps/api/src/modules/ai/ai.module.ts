import { Module } from '@nestjs/common';
import { AccessLevelService } from './access-level.js';
import { EmbeddingService } from './embedding/embedding.service.js';
import { AdminKnowledgeController } from './knowledge/admin-knowledge.controller.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';

/**
 * The phase-2 assistant (`docs/AI-ASSISTANT.md`).
 *
 * It grows in the order the epics do — knowledge base (2A), answer engine (2B),
 * chat and the sales loop (2C), the portal and staff copilot (2D), admin and
 * quality (2E) — and it calls the existing modules rather than restating them:
 * prices come from `PricingService`, deadlines from `AdmissionsService`, the
 * client's next step from `MeService`. Nothing in here is a second source of a
 * number.
 */
@Module({
  controllers: [AdminKnowledgeController],
  providers: [AccessLevelService, EmbeddingService, KnowledgeService],
  exports: [AccessLevelService, EmbeddingService, KnowledgeService],
})
export class AiModule {}
