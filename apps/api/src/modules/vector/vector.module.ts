import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service.js';
import { VectorController } from './vector.controller.js';
import { VectorService } from './vector.service.js';

@Module({
  controllers: [VectorController],
  providers: [VectorService, EmbeddingService],
  exports: [VectorService, EmbeddingService],
})
export class VectorModule {}
