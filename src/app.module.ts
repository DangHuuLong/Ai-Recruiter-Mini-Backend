import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { emailConfig } from './config/email.config';
import { envValidationSchema } from './config/env.validation';
import { queueConfig } from './config/queue.config';
import { redisConfig } from './config/redis.config';
import { supabaseConfig } from './config/supabase.config';
import { PrismaModule } from './database/prisma/prisma.module';
import { AiModule } from './integrations/ai/ai.module';
import { EmailModule } from './integrations/email/email.module';
import { RedisModule } from './integrations/redis/redis.module';
import { StorageModule } from './integrations/storage/storage.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthTokenModule } from './modules/auth/auth-token.module';
import { AuthModule } from './modules/auth/auth.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { JobDescriptionsModule } from './modules/job-descriptions/job-descriptions.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { ScoringBatchesModule } from './modules/scoring-batches/scoring-batches.module';
import { UsersModule } from './modules/users/users.module';
import { BatchStoreModule } from './queue/batch-store/batch-store.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, supabaseConfig, redisConfig, emailConfig, queueConfig],
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    StorageModule,
    RedisModule,
    EmailModule,
    HealthModule,
    AiModule,
    AuthTokenModule,
    AuthModule,
    UsersModule,
    FilesModule,
    CandidatesModule,
    ResumesModule,
    JobDescriptionsModule,
    ApplicationsModule,
    EvaluationsModule,
    BatchStoreModule,
    QueueModule,
    ScoringBatchesModule,
  ],
})
export class AppModule {}
