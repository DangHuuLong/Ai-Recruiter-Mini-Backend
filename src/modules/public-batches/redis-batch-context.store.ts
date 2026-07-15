import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScoringBatchStatus } from '@prisma/client';
import Redis from 'ioredis';

import { DEFAULT_EVALUATION_CRITERIA } from '../../common/constants/default-evaluation-criteria';
import { AppException } from '../../common/exceptions/app.exception';
import {
  ParsedJobDescriptionData,
  ParsedResumeData,
  ScoreCriterionConfig,
} from '../../common/types/ai-service.types';
import { RedisService } from '../../integrations/redis/redis.service';
import {
  BatchContextStore,
  CounterResult,
  JdItemPatch,
  ResultPatch,
  ResumeItemPatch,
  ScoreCounterResult,
} from '../../queue/batch-store/batch-context-store.interface';

export interface PublicResumeItemRecord {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  candidateLabel?: string | null;
  checksum?: string | null;
  rawText?: string | null;
  parsedData?: ParsedResumeData | null;
  parsingError?: string | null;
}

export interface PublicJdItemRecord {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  label?: string | null;
  rawText?: string | null;
  parsedData?: ParsedJobDescriptionData | null;
  parsingError?: string | null;
}

export interface PublicResultRecord {
  resumeItemId: string;
  jdItemId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  overallScore?: number | null;
  summary?: string | null;
  criteria?: unknown;
  skills?: unknown;
  explanation?: string | null;
  skillGapSummary?: string | null;
  interviewQuestions?: unknown;
  evidenceMap?: unknown;
  error?: string | null;
}

export interface PublicBatchMeta {
  id: string;
  ownerSessionId: string;
  name?: string | null;
  status: ScoringBatchStatus;
  totalCvCount: number;
  totalJdCount: number;
  totalPairCount: number;
  completedPairCount: number;
  failedPairCount: number;
  notifyWebhookUrl?: string | null;
  notifyEmail?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface PublicBatchSnapshot {
  meta: PublicBatchMeta;
  resumeItems: PublicResumeItemRecord[];
  jdItems: PublicJdItemRecord[];
  results: PublicResultRecord[];
}

// Ephemeral, Redis-backed BatchContextStore for the public tier. All keys
// for a batch share one TTL, refreshed on every write — an abandoned batch
// just expires, no cleanup job needed. Counts recompute via HGETALL rather
// than an atomic counter, avoiding double-count on BullMQ retries.
@Injectable()
export class RedisBatchContextStore implements BatchContextStore {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async createBatch(params: {
    id: string;
    ownerSessionId: string;
    name?: string;
    totalCvCount: number;
    totalJdCount: number;
    notifyWebhookUrl?: string | null;
    notifyEmail?: string | null;
  }): Promise<void> {
    const meta: PublicBatchMeta = {
      id: params.id,
      ownerSessionId: params.ownerSessionId,
      name: params.name ?? null,
      status: 'PENDING',
      totalCvCount: params.totalCvCount,
      totalJdCount: params.totalJdCount,
      totalPairCount: 0,
      completedPairCount: 0,
      failedPairCount: 0,
      notifyWebhookUrl: params.notifyWebhookUrl ?? null,
      notifyEmail: params.notifyEmail ?? null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };

    const client = this.redisService.getClient();
    await client.set(this.metaKey(params.id), JSON.stringify(meta));
    await this.touchTtl(params.id);
  }

  async addResumeItem(batchId: string, item: PublicResumeItemRecord): Promise<void> {
    const client = this.redisService.getClient();
    await client.hset(this.resumesKey(batchId), item.id, JSON.stringify(item));
    await this.touchTtl(batchId);
  }

  async addJdItem(batchId: string, item: PublicJdItemRecord): Promise<void> {
    const client = this.redisService.getClient();
    await client.hset(this.jdsKey(batchId), item.id, JSON.stringify(item));
    await this.touchTtl(batchId);
  }

  async getBatchSnapshot(batchId: string): Promise<PublicBatchSnapshot | null> {
    const client = this.redisService.getClient();
    const metaRaw = await client.get(this.metaKey(batchId));

    if (!metaRaw) {
      return null;
    }

    const [resumesMap, jdsMap, resultsMap] = await Promise.all([
      client.hgetall(this.resumesKey(batchId)),
      client.hgetall(this.jdsKey(batchId)),
      client.hgetall(this.resultsKey(batchId)),
    ]);

    return {
      meta: JSON.parse(metaRaw) as PublicBatchMeta,
      resumeItems: Object.values(resumesMap).map((raw) => JSON.parse(raw)),
      jdItems: Object.values(jdsMap).map((raw) => JSON.parse(raw)),
      results: Object.values(resultsMap).map((raw) => JSON.parse(raw)),
    };
  }

  async updateResumeItem(
    batchId: string,
    resumeItemId: string,
    patch: ResumeItemPatch,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const raw = await client.hget(this.resumesKey(batchId), resumeItemId);

    if (!raw) {
      return;
    }

    const current = JSON.parse(raw) as PublicResumeItemRecord;
    const updated: PublicResumeItemRecord = {
      ...current,
      status: patch.status,
      rawText: patch.rawText ?? current.rawText,
      parsedData: patch.parsedData ?? current.parsedData,
      parsingError: patch.parsingError ?? current.parsingError,
    };

    await client.hset(this.resumesKey(batchId), resumeItemId, JSON.stringify(updated));

    // Cache only actually-parsed results, not pending placeholders.
    if (patch.status === 'SUCCESS' && current.checksum && patch.parsedData) {
      const metaRaw = await client.get(this.metaKey(batchId));

      if (metaRaw) {
        const meta = JSON.parse(metaRaw) as PublicBatchMeta;
        const ttl = this.getTtlSeconds();
        await client.set(
          this.sessionChecksumKey(meta.ownerSessionId, current.checksum),
          JSON.stringify(patch.parsedData),
          'EX',
          ttl,
        );
      }
    }

    await this.touchTtl(batchId);
  }

  async updateJdItem(batchId: string, jdItemId: string, patch: JdItemPatch): Promise<void> {
    const client = this.redisService.getClient();
    const raw = await client.hget(this.jdsKey(batchId), jdItemId);

    if (!raw) {
      return;
    }

    const current = JSON.parse(raw) as PublicJdItemRecord;
    const updated: PublicJdItemRecord = {
      ...current,
      status: patch.status,
      parsedData: patch.parsedData ?? current.parsedData,
      parsingError: patch.parsingError ?? current.parsingError,
    };

    await client.hset(this.jdsKey(batchId), jdItemId, JSON.stringify(updated));
    await this.touchTtl(batchId);
  }

  async upsertResult(
    batchId: string,
    resumeItemId: string,
    jdItemId: string,
    patch: ResultPatch,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const record: PublicResultRecord = {
      resumeItemId,
      jdItemId,
      status: patch.status,
      overallScore: patch.overallScore ?? null,
      summary: patch.summary ?? null,
      criteria: patch.criteria ?? null,
      skills: patch.skills ?? null,
      explanation: patch.explanation ?? null,
      skillGapSummary: patch.skillGapSummary ?? null,
      interviewQuestions: patch.interviewQuestions ?? null,
      evidenceMap: patch.evidenceMap ?? null,
      error: patch.error ?? null,
    };

    await client.hset(this.resultsKey(batchId), this.resultField(resumeItemId, jdItemId), JSON.stringify(record));
    await this.touchTtl(batchId);
  }

  async incrementParseCompleted(batchId: string): Promise<CounterResult> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);
    const [resumes, jds] = await Promise.all([
      client.hgetall(this.resumesKey(batchId)),
      client.hgetall(this.jdsKey(batchId)),
    ]);

    const completed = this.countSettled(resumes) + this.countSettled(jds);

    return { completed, total: meta.totalCvCount + meta.totalJdCount };
  }

  async incrementScoreCompleted(batchId: string): Promise<ScoreCounterResult> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);
    const resultsMap = await client.hgetall(this.resultsKey(batchId));
    const results = Object.values(resultsMap).map((raw) => JSON.parse(raw) as PublicResultRecord);

    const completed = results.filter((r) => r.status === 'COMPLETED' || r.status === 'FAILED').length;
    const failed = results.filter((r) => r.status === 'FAILED').length;

    meta.completedPairCount = completed;
    meta.failedPairCount = failed;
    await this.writeMeta(client, batchId, meta);

    return { completed, total: meta.totalPairCount, failed };
  }

  async getResumeParsedData(batchId: string, resumeItemId: string): Promise<ParsedResumeData | null> {
    const client = this.redisService.getClient();
    const raw = await client.hget(this.resumesKey(batchId), resumeItemId);

    if (!raw) {
      return null;
    }

    return (JSON.parse(raw) as PublicResumeItemRecord).parsedData ?? null;
  }

  async getJdParsedData(
    batchId: string,
    jdItemId: string,
  ): Promise<ParsedJobDescriptionData | null> {
    const client = this.redisService.getClient();
    const raw = await client.hget(this.jdsKey(batchId), jdItemId);

    if (!raw) {
      return null;
    }

    return (JSON.parse(raw) as PublicJdItemRecord).parsedData ?? null;
  }

  async findCachedParsedResumeByChecksum(
    scope: { organizationId?: string; sessionId?: string },
    checksum: string,
  ): Promise<ParsedResumeData | null> {
    if (!scope.sessionId || !checksum) {
      return null;
    }

    const client = this.redisService.getClient();
    const raw = await client.get(this.sessionChecksumKey(scope.sessionId, checksum));

    return raw ? (JSON.parse(raw) as ParsedResumeData) : null;
  }

  async markBatchStatus(batchId: string, status: ScoringBatchStatus): Promise<void> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);
    const isTerminal =
      status === 'COMPLETED' ||
      status === 'COMPLETED_WITH_ERRORS' ||
      status === 'FAILED' ||
      status === 'CANCELLED';

    meta.status = status;
    if (status === 'PARSING' && !meta.startedAt) {
      meta.startedAt = new Date().toISOString();
    }
    if (isTerminal) {
      meta.completedAt = new Date().toISOString();
    }

    await this.writeMeta(client, batchId, meta);
  }

  async getBatchStatusOnly(batchId: string): Promise<ScoringBatchStatus> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);

    return meta.status;
  }

  async getNotifyTarget(
    batchId: string,
  ): Promise<{ webhookUrl?: string | null; email?: string | null }> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);

    return { webhookUrl: meta.notifyWebhookUrl, email: meta.notifyEmail };
  }

  async getSuccessfullyParsedItemIds(
    batchId: string,
  ): Promise<{ resumeItemIds: string[]; jdItemIds: string[] }> {
    const client = this.redisService.getClient();
    const [resumes, jds] = await Promise.all([
      client.hgetall(this.resumesKey(batchId)),
      client.hgetall(this.jdsKey(batchId)),
    ]);

    return {
      resumeItemIds: this.filterSuccessIds(resumes),
      jdItemIds: this.filterSuccessIds(jds),
    };
  }

  async getBatchCriteria(_batchId: string): Promise<ScoreCriterionConfig[]> {
    // No persisted EvaluationConfig for public batches.
    return DEFAULT_EVALUATION_CRITERIA;
  }

  async getBatchTotals(
    batchId: string,
  ): Promise<{ totalCvCount: number; totalJdCount: number; totalPairCount: number }> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);

    return {
      totalCvCount: meta.totalCvCount,
      totalJdCount: meta.totalJdCount,
      totalPairCount: meta.totalPairCount,
    };
  }

  async setBatchPairCount(batchId: string, totalPairCount: number): Promise<void> {
    const client = this.redisService.getClient();
    const meta = await this.readMeta(client, batchId);
    meta.totalPairCount = totalPairCount;
    await this.writeMeta(client, batchId, meta);
  }

  private countSettled(map: Record<string, string>): number {
    return Object.values(map).filter((raw) => {
      const item = JSON.parse(raw) as { status: string };
      return item.status === 'SUCCESS' || item.status === 'FAILED';
    }).length;
  }

  private filterSuccessIds(map: Record<string, string>): string[] {
    return Object.entries(map)
      .filter(([, raw]) => (JSON.parse(raw) as { status: string }).status === 'SUCCESS')
      .map(([id]) => id);
  }

  private async readMeta(client: Redis, batchId: string): Promise<PublicBatchMeta> {
    const raw = await client.get(this.metaKey(batchId));

    if (!raw) {
      throw new AppException(`Public batch ${batchId} not found or expired`, 404);
    }

    return JSON.parse(raw) as PublicBatchMeta;
  }

  private async writeMeta(client: Redis, batchId: string, meta: PublicBatchMeta): Promise<void> {
    await client.set(this.metaKey(batchId), JSON.stringify(meta));
    await this.touchTtl(batchId);
  }

  private async touchTtl(batchId: string): Promise<void> {
    const client = this.redisService.getClient();
    const ttl = this.getTtlSeconds();
    await Promise.all([
      client.expire(this.metaKey(batchId), ttl),
      client.expire(this.resumesKey(batchId), ttl),
      client.expire(this.jdsKey(batchId), ttl),
      client.expire(this.resultsKey(batchId), ttl),
    ]);
  }

  private getTtlSeconds(): number {
    return this.configService.get<number>('PUBLIC_BATCH_TTL_SECONDS') ?? 21600;
  }

  private resultField(resumeItemId: string, jdItemId: string): string {
    return `${resumeItemId}:${jdItemId}`;
  }

  private metaKey(batchId: string): string {
    return `public:batch:${batchId}:meta`;
  }

  private resumesKey(batchId: string): string {
    return `public:batch:${batchId}:resumes`;
  }

  private jdsKey(batchId: string): string {
    return `public:batch:${batchId}:jds`;
  }

  private resultsKey(batchId: string): string {
    return `public:batch:${batchId}:results`;
  }

  private sessionChecksumKey(sessionId: string, checksum: string): string {
    return `public:session:${sessionId}:checksum:${checksum}`;
  }
}
