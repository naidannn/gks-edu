import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AI_INGEST_QUEUE } from '../../queue/queue.constants.js';
import { AccessLevelService } from './access-level.js';
import { AdminAiConfigController } from './admin-ai-config.controller.js';
import { AiConfigService } from './ai-config.service.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { FxModule } from '../fx/fx.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { UniversitiesModule } from '../universities/universities.module.js';
import { BudgetService } from './chat/budget.service.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatSessionService } from './chat/chat-session.service.js';
import { GuardService } from './chat/guard.service.js';
import { OptionalUserService } from './chat/optional-user.service.js';
import { AdmissionsTools } from './chat/tools/admissions.tools.js';
import { CatalogTools } from './chat/tools/catalog.tools.js';
import { KnowledgeTools } from './chat/tools/knowledge.tools.js';
import { PricingTools } from './chat/tools/pricing.tools.js';
import { ToolRegistry } from './chat/tools/tool-registry.service.js';
import { TurnOrchestrator } from './chat/turn.orchestrator.js';
import { LlmService } from './llm/llm.service.js';
import { DeepseekChatProvider } from './llm/providers/deepseek.provider.js';
import { GeminiChatProvider } from './llm/providers/gemini.provider.js';
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
  imports: [
    BullModule.registerQueue({ name: AI_INGEST_QUEUE }),
    JwtModule.register({}),
    NotificationsModule,
    // The tools are wrappers over these, and that is the point: the assistant
    // reads the same rows the website reads, through the same services (§5.3).
    UniversitiesModule,
    ProgramsModule,
    AdmissionsModule,
    PricingModule,
    FxModule,
  ],
  controllers: [AdminKnowledgeController, AdminAiConfigController, ChatController],
  providers: [
    AccessLevelService,
    AiConfigService,
    GeminiChatProvider,
    DeepseekChatProvider,
    LlmService,
    EmbeddingService,
    KnowledgeService,
    RetrievalService,
    IngestService,
    IngestProcessor,
    ContentSyncService,
    ChatSessionService,
    BudgetService,
    GuardService,
    CatalogTools,
    AdmissionsTools,
    PricingTools,
    KnowledgeTools,
    ToolRegistry,
    TurnOrchestrator,
    OptionalUserService,
  ],
  exports: [
    AccessLevelService,
    AiConfigService,
    LlmService,
    EmbeddingService,
    KnowledgeService,
    RetrievalService,
    IngestService,
    ContentSyncService,
    ChatSessionService,
    ToolRegistry,
  ],
})
export class AiModule {}
