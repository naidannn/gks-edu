import { Module } from '@nestjs/common';
import { EssayDocumentsService } from './essay-documents.service.js';
import { EssayQuestionnaireService } from './essay-questionnaire.service.js';
import { PublicRecommendationController, QuestionnairesController } from './questionnaires.controller.js';
import { RecommendationsService } from './recommendations.service.js';

/** 1D-27 — the GKS essay and recommendation questionnaires; 1D-28 — the essays written from them. */
@Module({
  controllers: [QuestionnairesController, PublicRecommendationController],
  providers: [EssayQuestionnaireService, EssayDocumentsService, RecommendationsService],
})
export class QuestionnairesModule {}
