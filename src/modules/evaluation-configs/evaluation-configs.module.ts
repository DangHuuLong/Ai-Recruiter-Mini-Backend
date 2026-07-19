import { Module } from '@nestjs/common';

import { EvaluationConfigsController } from './evaluation-configs.controller';
import { EvaluationConfigsService } from './evaluation-configs.service';

@Module({
  controllers: [EvaluationConfigsController],
  providers: [EvaluationConfigsService],
  exports: [EvaluationConfigsService],
})
export class EvaluationConfigsModule {}
