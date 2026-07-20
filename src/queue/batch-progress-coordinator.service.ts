// Listens for job completion across the parse/score queues and drives batch
// stage transitions (PARSING -> SCORING -> COMPLETED), guarded by a Redis
// NX lock per batch/transition since the side effects aren't idempotent.
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';

import { BatchTier, QUEUE_NAMES } from './queue.constants';
import { BatchContextStoreFactory } from './batch-store/batch-context-store.factory';
import { JdParseJobData, NotifyJobData, ResumeParseJobData, ScorePairJobData } from './jobs/job-payloads.types';
import { RedisService } from '../integrations/redis/redis.service';

const TRANSITION_LOCK_TTL_SECONDS = 3600;

@Injectable()
export class BatchProgressCoordinatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchProgressCoordinatorService.name);
  private resumeParseEvents?: QueueEvents;
  private jdParseEvents?: QueueEvents;
  private scorePairEvents?: QueueEvents;

  constructor(
    private readonly configService: ConfigService,
    private readonly storeFactory: BatchContextStoreFactory,
    private readonly redisService: RedisService,
    @InjectQueue(QUEUE_NAMES.RESUME_PARSE) private readonly resumeParseQueue: Queue<ResumeParseJobData>,
    @InjectQueue(QUEUE_NAMES.JD_PARSE) private readonly jdParseQueue: Queue<JdParseJobData>,
    @InjectQueue(QUEUE_NAMES.SCORE_PAIR) private readonly scorePairQueue: Queue<ScorePairJobData>,
    @InjectQueue(QUEUE_NAMES.NOTIFY) private readonly notifyQueue: Queue<NotifyJobData>,
  ) {}

  // Nest lifecycle hook: opens QueueEvents listeners on the parse/score queues to drive batch stage transitions.
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

  // Nest lifecycle hook: closes the QueueEvents listeners opened in onModuleInit on app shutdown.
  async onModuleDestroy() {
    await Promise.all([
      this.resumeParseEvents?.close(),
      this.jdParseEvents?.close(),
      this.scorePairEvents?.close(),
    ]);
  }

  // Wired to the resume/jd-parse QueueEvents 'failed' listeners in onModuleInit; marks the item FAILED after retries are exhausted.
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

  // Wired to the resume/jd-parse QueueEvents 'completed' listeners in onModuleInit; forwards to checkParseCompletion.
  private async onParseSettled<T extends { batchId: string; tier: BatchTier }>(
    queue: Queue<T>,
    jobId: string | undefined,
  ) {
    const job = jobId ? await queue.getJob(jobId) : undefined;
    if (!job) return;

    await this.checkParseCompletion(job.data.batchId, job.data.tier);
  }

  // Called from onParseSettled and directly by scoring-batches.service.ts/public-batches.service.ts; advances a batch to the scoring stage once all parse jobs finish.
  async checkParseCompletion(batchId: string, tier: BatchTier): Promise<void> {
    const store = this.storeFactory.forTier(tier);

    const { completed, total } = await store.incrementParseCompleted(batchId);
    if (completed < total) return;

    const acquired = await this.acquireTransitionLock(batchId, 'scoring-stage');
    if (!acquired) return;

    if ((await store.getBatchStatusOnly(batchId)) === 'CANCELLED') return;

    await this.startScoringStage(store, batchId, tier);
  }

  // Called by checkParseCompletion once the transition lock is acquired; enqueues one score-pair job per resume/JD combination.
  private async startScoringStage(
    store: ReturnType<BatchContextStoreFactory['forTier']>,
    batchId: string,
    tier: 'ENTERPRISE' | 'PUBLIC',
  ) {
    const { resumeItemIds, jdItemIds } = await store.getSuccessfullyParsedItemIds(batchId);
    const totalPairCount = resumeItemIds.length * jdItemIds.length;

    await store.setBatchPairCount(batchId, totalPairCount);

    if (totalPairCount === 0) {
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

  // Wired to the score-pair QueueEvents 'failed' listener in onModuleInit; records the pair result as FAILED after retries are exhausted.
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

  // Wired to the score-pair QueueEvents 'completed' listener in onModuleInit; marks the batch COMPLETED and triggers notify once all pairs are scored.
  private async onScoreSettled(queue: Queue<ScorePairJobData>, jobId: string | undefined) {
    const job = jobId ? await queue.getJob(jobId) : undefined;
    if (!job) return;

    const { batchId, tier } = job.data;
    const store = this.storeFactory.forTier(tier);

    const { completed, total, failed } = await store.incrementScoreCompleted(batchId);
    if (completed < total) return;

    const acquired = await this.acquireTransitionLock(batchId, 'completion');
    if (!acquired) return;

    if ((await store.getBatchStatusOnly(batchId)) === 'CANCELLED') return;

    const finalStatus = failed > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    await store.markBatchStatus(batchId, finalStatus);
    await this.enqueueNotifyIfConfigured(store, batchId, tier, finalStatus);
  }

  // Redis NX lock so only one worker performs a given batch stage transition, since the side effects aren't idempotent.
  private async acquireTransitionLock(batchId: string, stage: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const result = await client.set(
      `batch-lock:${batchId}:${stage}`,
      '1',
      'EX',
      TRANSITION_LOCK_TTL_SECONDS,
      'NX',
    );

    return result === 'OK';
  }

  // Called by startScoringStage/onScoreSettled to enqueue a notify job when the batch has a webhook/email target configured.
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
