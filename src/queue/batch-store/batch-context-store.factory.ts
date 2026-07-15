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

  forTier(tier: BatchTier): BatchContextStore {
    if (tier === 'ENTERPRISE') {
      return this.prismaStore;
    }

    return this.redisStore;
  }
}
