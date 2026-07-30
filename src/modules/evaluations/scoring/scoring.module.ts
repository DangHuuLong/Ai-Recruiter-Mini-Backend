// Global module wiring for ScoringResultMapperService (depends on InterviewQuestionsModule).
import { Global, Module } from '@nestjs/common';

import { ScoringResultMapperService } from './scoring.service';
import { InterviewQuestionsModule } from '../../interview-questions/interview-questions.module';

@Global()
@Module({
  imports: [InterviewQuestionsModule],
  providers: [ScoringResultMapperService],
  exports: [ScoringResultMapperService],
})
export class ScoringModule {}
