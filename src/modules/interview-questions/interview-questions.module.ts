import { Module } from '@nestjs/common';

import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { InterviewQuestionsController } from './interview-questions.controller';
import { InterviewQuestionsService } from './interview-questions.service';
import { LlmProvidersModule } from '../../integrations/llm-providers/llm-providers.module';

@Module({
  imports: [LlmProvidersModule],
  controllers: [InterviewQuestionsController],
  providers: [InterviewQuestionsService, InterviewQuestionGeneratorService],
  exports: [InterviewQuestionsService],
})
export class InterviewQuestionsModule {}
