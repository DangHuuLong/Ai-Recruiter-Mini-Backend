// Picks the Prisma or Redis batch context store implementation based on batch tier.
import { Injectable } from '@nestjs/common';

import { BatchContextStore } from './batch-context-store.interface';
import { PrismaBatchContextStore } from '../../modules/scoring-batches/prisma-batch-context.store';
import { RedisBatchContextStore } from '../../modules/public-batches/redis-batch-context.store';
import { BatchTier } from '../queue.constants';

@Injectable()
export class BatchContextStoreFactory {
  constructor(
    private readonly prismaStore: PrismaBatchContextStore,
    private readonly redisStore: RedisBatchContextStore,
  ) {}

  // Called throughout the queue processors and batch services to get the right store (Prisma for enterprise, Redis for public) without branching on tier everywhere.
  forTier(tier: BatchTier): BatchContextStore {
    if (tier === 'ENTERPRISE') {
      return this.prismaStore;
    }

    return this.redisStore;
  }
}
