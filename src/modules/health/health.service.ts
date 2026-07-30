// Checks database, Redis, and storage bucket connectivity and reports overall service health.
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../integrations/redis/redis.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  // Called by HealthController.check — pings Postgres, Redis (if enabled), and storage to build the health report.
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;

    let redis = 'disabled';

    if (this.redisService.isEnabled()) {
      await this.redisService.ping();
      redis = 'ok';
    }

    await this.storageService.checkBucket();

    return {
      service: 'ai-recruiter-mini-backend',
      status: 'healthy',
      database: 'ok',
      redis,
      storage: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
