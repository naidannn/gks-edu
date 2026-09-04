import { Module } from '@nestjs/common';
import { AdminUniversitiesController } from './admin-universities.controller.js';
import { AdminUniversitiesService } from './admin-universities.service.js';
import { UniversitiesController } from './universities.controller.js';
import { UniversitiesService } from './universities.service.js';

@Module({
  controllers: [UniversitiesController, AdminUniversitiesController],
  providers: [UniversitiesService, AdminUniversitiesService],
  exports: [UniversitiesService],
})
export class UniversitiesModule {}
