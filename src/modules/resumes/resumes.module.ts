import { Module } from '@nestjs/common';

import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { AiModule } from '../../integrations/ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
