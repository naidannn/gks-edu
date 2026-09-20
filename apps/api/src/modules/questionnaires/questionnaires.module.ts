import { Module } from '@nestjs/common';
import { EssayQuestionnaireService } from './essay-questionnaire.service.js';
import { PublicRecommendationController, QuestionnairesController } from './questionnaires.controller.js';
import { RecommendationsService } from './recommendations.service.js';

/** 1D-27 — the GKS essay and recommendation questionnaires. */
@Module({
  controllers: [QuestionnairesController, PublicRecommendationController],
  providers: [EssayQuestionnaireService, RecommendationsService],
})
export class QuestionnairesModule {}
