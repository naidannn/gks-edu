import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { FaqController } from './faq.controller.js';
import { FaqService } from './faq.service.js';

@Module({
  imports: [AiModule],
  controllers: [FaqController],
  providers: [FaqService],
  exports: [FaqService],
})
export class FaqModule {}
