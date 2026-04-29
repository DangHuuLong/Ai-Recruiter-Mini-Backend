import { Module } from '@nestjs/common';

import { ResumesController } from './resumes.controller';
import { ResumesService } from './resumes.service';
import { AiModule } from '../../integrations/ai/ai.module';
import { ParsingModule } from '../../integrations/parsing/parsing.module';
import { StorageModule } from '../../integrations/storage/storage.module';

@Module({
  imports: [AiModule, ParsingModule, StorageModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
