import { Module } from '@nestjs/common';
import { EssayDocumentsService } from './essay-documents.service.js';
import { EssayQuestionnaireService } from './essay-questionnaire.service.js';
import { ClientProfileQuestionnaireController, MyProfileQuestionnaireController } from './profile-questionnaire.controller.js';
import { ProfileQuestionnaireService } from './profile-questionnaire.service.js';
import { PublicRecommendationController, QuestionnairesController } from './questionnaires.controller.js';
import { RecommendationsService } from './recommendations.service.js';

/**
 * 1D-27 — the GKS essay and recommendation questionnaires; 1D-28 — the essays
 * written from them; 1B-29 — the profile questionnaire every client answers.
 */
@Module({
  controllers: [
    QuestionnairesController,
    PublicRecommendationController,
    MyProfileQuestionnaireController,
    ClientProfileQuestionnaireController,
  ],
  providers: [EssayQuestionnaireService, EssayDocumentsService, RecommendationsService, ProfileQuestionnaireService],
})
export class QuestionnairesModule {}
