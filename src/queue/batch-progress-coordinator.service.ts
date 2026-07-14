import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';

import { BatchTier, QUEUE_NAMES } from './queue.constants';
import { BatchContextStoreFactory } from './batch-store/batch-context-store.factory';
import { JdParseJobData, NotifyJobData, ResumeParseJobData, ScorePairJobData } from './jobs/job-payloads.types';

/**
 * Listens for job completion across the parse/score queues and drives batch
 * stage transitions (PARSING -> SCORING -> COMPLETED). Deliberately reacts
 * only to queue-level events (post-retry-exhaustion), never counts from
 * inside a processor's own try/catch — that would double-count on BullMQ
 * retries. Safe to react redundantly since progress counts are recomputed
 * from the store's source of truth on every event, not incremented.
 */
@Injectable()
export class BatchProgressCoordinatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchProgressCoordinatorService.name);
  private resumeParseEvents?: QueueEvents;
  private jdParseEvents?: QueueEvents;
  private scorePairEvents?: QueueEvents;

  constructor(
    private readonly configService: ConfigService,
    private readonly storeFactory: BatchContextStoreFactory,
    @InjectQueue(QUEUE_NAMES.RESUME_PARSE) private readonly resumeParseQueue: Queue<ResumeParseJobData>,
    @InjectQueue(QUEUE_NAMES.JD_PARSE) private readonly jdParseQueue: Queue<JdParseJobData>,
    @InjectQueue(QUEUE_NAMES.SCORE_PAIR) private readonly scorePairQueue: Queue<ScorePairJobData>,
    @InjectQueue(QUEUE_NAMES.NOTIFY) private readonly notifyQueue: Queue<NotifyJobData>,
  ) {}

  onModuleInit() {
    const connection = { url: this.configService.get<string>('queue.redisUrl'), maxRetriesPerRequest: null as null };

    this.resumeParseEvents = new QueueEvents(QUEUE_NAMES.RESUME_PARSE, { connection });
    this.jdParseEvents = new QueueEvents(QUEUE_NAMES.JD_PARSE, { connection });
    this.scorePairEvents = new QueueEvents(QUEUE_NAMES.SCORE_PAIR, { connection });

    this.resumeParseEvents.on('completed', ({ jobId }) => this.onParseSettled(this.resumeParseQueue, jobId));
    this.resumeParseEvents.on('failed', ({ jobId }) => this.onParseFailedExhausted(this.resumeParseQueue, jobId, 'resume'));

    this.jdParseEvents.on('completed', ({ jobId }) => this.onParseSettled(this.jdParseQueue, jobId));
    this.jdParseEvents.on('failed', ({ jobId }) => this.onParseFailedExhausted(this.jdParseQueue, jobId, 'jd'));

    this.scorePairEvents.on('completed', ({ jobId }) => this.onScoreSettled(this.scorePairQueue, jobId));
    this.scorePairEvents.on('failed', ({ jobId }) => this.onScoreFailedExhausted(this.scorePairQueue, jobId));
  }

  async onModuleDestroy() {
    await Promise.all([
      this.resumeParseEvents?.close(),
      this.jdParseEvents?.close(),
      this.scorePairEvents?.close(),
    ]);
  }

  private async onParseFailedExhausted<T extends { batchId: string; tier: BatchTier }>(
    queue: Queue<T>,
    jobId: string | undefined,
    kind: 'resume' | 'jd',
  ) {
    const job = jobId ? await queue.getJob(jobId) : undefined;
    if (!job) return;

    const store = this.storeFactory.forTier(job.data.tier);
    const errorMessage = job.failedReason ?? 'Parsing failed after retries were exhausted';

    if (kind === 'resume') {
      const data = job.data as ResumeParseJobData;
      await store.updateResumeItem(data.batchId, data.resumeItemId, {
        status: 'FAILED',
        parsingError: errorMessage,
      });
    } else {
      const data = job.data as JdParseJobData;
      await store.updateJdItem(data.batchId, data.jdItemId, { status: 'FAILED', parsingError: errorMessage });
    }

    await this.onParseSettled(queue, jobId);
  }

  private async onParseSettled<T extends { batchId: string; tier: BatchTier }>(
    queue: Queue<T>,
    jobId: string | undefined,
  ) {
    const job = jobId ? await queue.getJob(jobId) : undefined;
    if (!job) return;

    const { batchId, tier } = job.data;
    const store = this.storeFactory.forTier(tier);

    const { completed, total } = await store.incrementParseCompleted(batchId);
    if (completed < total) return;

    await this.startScoringStage(store, batchId, tier);
  }

  private async startScoringStage(
    store: ReturnType<BatchContextStoreFactory['forTier']>,
    batchId: string,
    tier: 'ENTERPRISE' | 'PUBLIC',
  ) {
    const { resumeItemIds, jdItemIds } = await store.getSuccessfullyParsedItemIds(batchId);
    const totalPairCount = resumeItemIds.length * jdItemIds.length;

    await store.setBatchPairCount(batchId, totalPairCount);

    if (totalPairCount === 0) {
      // Nothing scoreable (every CV or every JD failed to parse) — batch is
      // done, skip straight to the terminal state instead of hanging in SCORING.
      await store.markBatchStatus(batchId, 'COMPLETED_WITH_ERRORS');
      await this.enqueueNotifyIfConfigured(store, batchId, tier, 'COMPLETED_WITH_ERRORS');
      return;
    }

    await store.markBatchStatus(batchId, 'SCORING');
    const criteria = await store.getBatchCriteria(batchId);

    for (const resumeItemId of resumeItemIds) {
      for (const jdItemId of jdItemIds) {
        await this.scorePairQueue.add(
          'score-pair',
          { batchId, tier, resumeItemId, jdItemId, criteria },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
      }
    }
  }

  private async onScoreFailedExhausted(queue: Queue<ScorePairJobData>, jobId: string | undefined) {
    const job = jobId ? await queue.getJob(jobId) : undefined;
    if (!job) return;

    const store = this.storeFactory.forTier(job.data.tier);
    const { batchId, resumeItemId, jdItemId } = job.data;

    await store.upsertResult(batchId, resumeItemId, jdItemId, {
      status: 'FAILED',
      error: job.failedReason ?? 'Scoring failed after retries were exhausted',
    });

    await this.onScoreSettled(queue, jobId);
  }

  private async onScoreSettled(queue: Queue<ScorePairJobData>, jobId: string | undefined) {
    const job = jobId ? await queue.getJob(jobId) : undefined;
    if (!job) return;

    const { batchId, tier } = job.data;
    const store = this.storeFactory.forTier(tier);

    const { completed, total, failed } = await store.incrementScoreCompleted(batchId);
    if (completed < total) return;

    const finalStatus = failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    await store.markBatchStatus(batchId, finalStatus);
    await this.enqueueNotifyIfConfigured(store, batchId, tier, finalStatus);
  }

  private async enqueueNotifyIfConfigured(
    store: ReturnType<BatchContextStoreFactory['forTier']>,
    batchId: string,
    tier: 'ENTERPRISE' | 'PUBLIC',
    status: string,
  ) {
    const notifyTarget = await store.getNotifyTarget(batchId);
    if (!notifyTarget || (!notifyTarget.webhookUrl && !notifyTarget.email)) {
      return;
    }

    await this.notifyQueue.add('notify', {
      batchId,
      tier,
      status,
      webhookUrl: notifyTarget.webhookUrl,
      email: notifyTarget.email,
    });
  }
}
