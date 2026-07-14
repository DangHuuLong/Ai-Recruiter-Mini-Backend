import { Injectable } from '@nestjs/common';

import { BatchContextStore } from './batch-context-store.interface';
import { PrismaBatchContextStore } from '../../modules/scoring-batches/prisma-batch-context.store';
import { BatchTier } from '../queue.constants';

/**
 * Lets queue processors depend on a single abstraction regardless of tier —
 * enterprise batches resolve to the Postgres-backed store, public/anonymous
 * batches will resolve to a Redis-backed store once that's added (Phase 4).
 */
@Injectable()
export class BatchContextStoreFactory {
  constructor(private readonly prismaStore: PrismaBatchContextStore) {}

  forTier(tier: BatchTier): BatchContextStore {
    if (tier === 'ENTERPRISE') {
      return this.prismaStore;
    }

    // PUBLIC tier is served by an ephemeral Redis-backed store, added in a
    // later phase alongside the public batch upload endpoints. Nothing
    // enqueues PUBLIC jobs yet, so this branch is unreachable today.
    throw new Error(
      `No BatchContextStore implementation registered for tier "${tier}" yet (public/anonymous batches land in a later phase)`,
    );
  }
}
