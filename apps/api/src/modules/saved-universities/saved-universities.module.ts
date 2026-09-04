import { Module } from '@nestjs/common';
import { SavedUniversitiesController } from './saved-universities.controller.js';
import { SavedUniversitiesService } from './saved-universities.service.js';

@Module({
  controllers: [SavedUniversitiesController],
  providers: [SavedUniversitiesService],
})
export class SavedUniversitiesModule {}
