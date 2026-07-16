import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { QUEUE_NAMES } from './queue.constants';
import { BatchProgressCoordinatorService } from './batch-progress-coordinator.service';
import { ResumeParseProcessor } from './processors/resume-parse.processor';
import { JdParseProcessor } from './processors/jd-parse.processor';
import { ScorePairProcessor } from './processors/score-pair.processor';
import { NotifyProcessor } from './processors/notify.processor';
import { AiModule } from '../integrations/ai/ai.module';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('queue.redisUrl'),
          // BullMQ requires this — it cannot reuse RedisService's existing
          // ioredis client, which doesn't set this option. Same Redis
          // deployment, separate connection.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.RESUME_PARSE, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } },
      { name: QUEUE_NAMES.JD_PARSE, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } },
      { name: QUEUE_NAMES.SCORE_PAIR, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } },
      { name: QUEUE_NAMES.NOTIFY, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } },
    ),
    HttpModule,
    AiModule,
    EmailModule,
  ],
  providers: [
    ResumeParseProcessor,
    JdParseProcessor,
    ScorePairProcessor,
    NotifyProcessor,
    BatchProgressCoordinatorService,
  ],
  exports: [BullModule, BatchProgressCoordinatorService],
})
export class QueueModule {}
