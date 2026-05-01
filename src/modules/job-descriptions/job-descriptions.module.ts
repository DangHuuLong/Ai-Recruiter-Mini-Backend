import { Module } from '@nestjs/common';

import { JobDescriptionsController } from './job-descriptions.controller';
import { JobDescriptionsService } from './job-descriptions.service';
import { AiModule } from '../../integrations/ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [JobDescriptionsController],
  providers: [JobDescriptionsService],
  exports: [JobDescriptionsService],
})
export class JobDescriptionsModule {}
