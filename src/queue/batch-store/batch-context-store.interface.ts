import { ParsedJobDescriptionData, ParsedResumeData } from '../../common/types/ai-service.types';
import { ScoringBatchStatus } from '@prisma/client';

export interface ResumeItemPatch {
  status: 'SUCCESS' | 'FAILED';
  rawText?: string;
  parsedData?: ParsedResumeData;
  parsingError?: string;
}

export interface JdItemPatch {
  status: 'SUCCESS' | 'FAILED';
  parsedData?: ParsedJobDescriptionData;
  parsingError?: string;
}

export interface ResultPatch {
  status: 'COMPLETED' | 'FAILED';
  overallScore?: number;
  summary?: string;
  criteria?: unknown;
  skills?: unknown;
  explanation?: string;
  skillGapSummary?: string;
  interviewQuestions?: unknown;
  evidenceMap?: unknown;
  error?: string;
}

export interface CounterResult {
  completed: number;
  total: number;
}

export interface ScoreCounterResult extends CounterResult {
  failed: number;
}

/**
 * Abstracts batch persistence so queue processors work identically for both
 * tiers: enterprise batches persist to Postgres (PrismaBatchContextStore),
 * public/anonymous batches persist to ephemeral Redis keys with a TTL
 * (RedisBatchContextStore, added in a later phase). Processors depend only
 * on this interface via BatchContextStoreFactory, never on a concrete store.
 */
export interface BatchContextStore {
  updateResumeItem(batchId: string, resumeItemId: string, patch: ResumeItemPatch): Promise<void>;
  updateJdItem(batchId: string, jdItemId: string, patch: JdItemPatch): Promise<void>;
  upsertResult(
    batchId: string,
    resumeItemId: string,
    jdItemId: string,
    patch: ResultPatch,
  ): Promise<void>;

  // Both of these recompute counts from the store's own source of truth
  // (COUNT query / equivalent) rather than maintaining a separate atomic
  // counter — safe to call redundantly (e.g. if a queue event fires more
  // than once) without risk of double-counting.
  incrementParseCompleted(batchId: string): Promise<CounterResult>;
  incrementScoreCompleted(batchId: string): Promise<ScoreCounterResult>;

  getResumeParsedData(batchId: string, resumeItemId: string): Promise<ParsedResumeData | null>;
  getJdParsedData(batchId: string, jdItemId: string): Promise<ParsedJobDescriptionData | null>;

  /** Returns a previously-parsed result for a resume with the same checksum, if one exists within this store's caching scope. */
  findCachedParsedResumeByChecksum(
    scope: { organizationId?: string; sessionId?: string },
    checksum: string,
  ): Promise<ParsedResumeData | null>;

  markBatchStatus(batchId: string, status: ScoringBatchStatus): Promise<void>;

  /** Lets processors bail out early on already-cancelled batches instead of burning an AI service call. */
  getBatchStatusOnly(batchId: string): Promise<ScoringBatchStatus>;

  getNotifyTarget(batchId: string): Promise<{ webhookUrl?: string | null; email?: string | null }>;

  /** Fetches ids/criteria needed to fan out score-pair jobs once all parsing finishes. */
  getSuccessfullyParsedItemIds(
    batchId: string,
  ): Promise<{ resumeItemIds: string[]; jdItemIds: string[] }>;

  getBatchCriteria(batchId: string): Promise<import('../../common/types/ai-service.types').ScoreCriterionConfig[]>;

  getBatchTotals(
    batchId: string,
  ): Promise<{ totalCvCount: number; totalJdCount: number; totalPairCount: number }>;

  setBatchPairCount(batchId: string, totalPairCount: number): Promise<void>;
}
