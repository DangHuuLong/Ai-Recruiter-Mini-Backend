import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import { supabaseConfig } from './config/supabase.config';
import { redisConfig } from './config/redis.config';
import { PrismaModule } from './database/prisma/prisma.module';
import { StorageModule } from './integrations/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './integrations/redis/redis.module';

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
  ],
})
export class AppModule { }