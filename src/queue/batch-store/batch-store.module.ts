import { Global, Module } from '@nestjs/common';

import { BatchContextStoreFactory } from './batch-context-store.factory';
import { PrismaBatchContextStore } from '../../modules/scoring-batches/prisma-batch-context.store';

@Global()
@Module({
  providers: [PrismaBatchContextStore, BatchContextStoreFactory],
  exports: [BatchContextStoreFactory],
})
export class BatchStoreModule {}
