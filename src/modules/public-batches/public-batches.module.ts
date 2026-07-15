import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PublicBatchesController } from './public-batches.controller';
import { PublicBatchesService } from './public-batches.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.RESUME_PARSE },
      { name: QUEUE_NAMES.JD_PARSE },
    ),
  ],
  controllers: [PublicBatchesController],
  providers: [PublicBatchesService],
})
export class PublicBatchesModule {}
