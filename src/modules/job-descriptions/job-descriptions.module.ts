import { Module } from '@nestjs/common';

import { JobDescriptionsController } from './job-descriptions.controller';
import { JobDescriptionsService } from './job-descriptions.service';
import { JobSkillsController } from './job-skills.controller';
import { JobSkillsService } from './job-skills.service';
import { AiModule } from '../../integrations/ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [JobDescriptionsController, JobSkillsController],
  providers: [JobDescriptionsService, JobSkillsService],
  exports: [JobDescriptionsService, JobSkillsService],
})
export class JobDescriptionsModule {}
