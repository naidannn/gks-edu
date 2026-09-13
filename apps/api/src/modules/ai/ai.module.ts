import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AI_INGEST_QUEUE } from '../../queue/queue.constants.js';
import { AccessLevelService } from './access-level.js';
import { AdminAiConfigController } from './admin-ai-config.controller.js';
import { AiConfigService } from './ai-config.service.js';
import { EmbeddingService } from './embedding/embedding.service.js';
import { AdminKnowledgeController } from './knowledge/admin-knowledge.controller.js';
import { ContentSyncService } from './knowledge/content-sync.service.js';
import { IngestProcessor } from './knowledge/ingest.processor.js';
import { IngestService } from './knowledge/ingest.service.js';
import { KnowledgeService } from './knowledge/knowledge.service.js';
import { RetrievalService } from './knowledge/retrieval.service.js';

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
  imports: [BullModule.registerQueue({ name: AI_INGEST_QUEUE })],
  controllers: [AdminKnowledgeController, AdminAiConfigController],
  providers: [
    AccessLevelService,
    AiConfigService,
    EmbeddingService,
    KnowledgeService,
    RetrievalService,
    IngestService,
    IngestProcessor,
    ContentSyncService,
  ],
  exports: [
    AccessLevelService,
    AiConfigService,
    EmbeddingService,
    KnowledgeService,
    RetrievalService,
    IngestService,
    ContentSyncService,
  ],
})
export class AiModule {}
