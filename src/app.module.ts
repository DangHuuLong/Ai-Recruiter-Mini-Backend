import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import { redisConfig } from './config/redis.config';
import { supabaseConfig } from './config/supabase.config';
import { PrismaModule } from './database/prisma/prisma.module';
import { AiModule } from './integrations/ai/ai.module';
import { RedisModule } from './integrations/redis/redis.module';
import { StorageModule } from './integrations/storage/storage.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { JobDescriptionsModule } from './modules/job-descriptions/job-descriptions.module';
import { ResumesModule } from './modules/resumes/resumes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, supabaseConfig, redisConfig],
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    StorageModule,
    RedisModule,
    HealthModule,
    AiModule,
    FilesModule,
    CandidatesModule,
    ResumesModule,
    JobDescriptionsModule,
    ApplicationsModule,
  ],
})
export class AppModule {}
