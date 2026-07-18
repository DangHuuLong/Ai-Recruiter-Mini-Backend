import { Module } from '@nestjs/common';

import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';
import { AiModule } from '../../integrations/ai/ai.module';
import { InterviewQuestionsModule } from '../interview-questions/interview-questions.module';

@Module({
  imports: [AiModule, InterviewQuestionsModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
