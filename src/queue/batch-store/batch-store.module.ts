import { Global, Module } from '@nestjs/common';

import { BatchContextStoreFactory } from './batch-context-store.factory';
import { PrismaBatchContextStore } from '../../modules/scoring-batches/prisma-batch-context.store';
import { RedisBatchContextStore } from '../../modules/public-batches/redis-batch-context.store';

@Global()
@Module({
  providers: [PrismaBatchContextStore, RedisBatchContextStore, BatchContextStoreFactory],
  exports: [BatchContextStoreFactory, RedisBatchContextStore],
})
export class BatchStoreModule {}
