// Nest module wiring for the Job Descriptions feature (JD + skills controllers/services, classifier, AI and LLM providers).
import { Module } from '@nestjs/common';

import { JobDescriptionClassifierService } from './job-description-classifier.service';
import { JobDescriptionsController } from './job-descriptions.controller';
import { JobDescriptionsService } from './job-descriptions.service';
import { JobSkillsController } from './job-skills.controller';
import { JobSkillsService } from './job-skills.service';
import { AiModule } from '../../integrations/ai/ai.module';
import { LlmProvidersModule } from '../../integrations/llm-providers/llm-providers.module';

@Module({
  imports: [AiModule, LlmProvidersModule],
  controllers: [JobDescriptionsController, JobSkillsController],
  providers: [JobDescriptionsService, JobSkillsService, JobDescriptionClassifierService],
  exports: [JobDescriptionsService, JobSkillsService, JobDescriptionClassifierService],
})
export class JobDescriptionsModule {}
