import { Module } from '@nestjs/common';

import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { AiModule } from '../../integrations/ai/ai.module';
import { StorageModule } from '../../integrations/storage/storage.module';

@Module({
  imports: [AiModule, StorageModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
