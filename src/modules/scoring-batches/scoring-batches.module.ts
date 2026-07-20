// Wires up the ScoringBatches feature module: controller, promote service, BullMQ parse queues, and job-descriptions dependency.
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ScoringBatchPromoteService } from './scoring-batch-promote.service';
import { ScoringBatchesController } from './scoring-batches.controller';
import { ScoringBatchesService } from './scoring-batches.service';
import { JobDescriptionsModule } from '../job-descriptions/job-descriptions.module';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.RESUME_PARSE },
      { name: QUEUE_NAMES.JD_PARSE },
    ),
    JobDescriptionsModule,
    QueueModule,
  ],
  controllers: [ScoringBatchesController],
  providers: [ScoringBatchesService, ScoringBatchPromoteService],
})
export class ScoringBatchesModule {}
