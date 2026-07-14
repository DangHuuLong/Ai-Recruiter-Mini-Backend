import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ScoringBatchesController } from './scoring-batches.controller';
import { ScoringBatchesService } from './scoring-batches.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.RESUME_PARSE },
      { name: QUEUE_NAMES.JD_PARSE },
    ),
  ],
  controllers: [ScoringBatchesController],
  providers: [ScoringBatchesService],
})
export class ScoringBatchesModule {}
