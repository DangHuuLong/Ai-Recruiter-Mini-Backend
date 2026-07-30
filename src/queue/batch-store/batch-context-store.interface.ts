// Batch persistence contract implemented by the Prisma (enterprise) and Redis (public) stores.
import { ParsedJobDescriptionData, ParsedResumeData } from '../../common/types/ai-service.types';
import { OccupationFamily, ScoringBatchStatus } from '@prisma/client';

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
  occupationFamily?: OccupationFamily | null;
  specialization?: string | null;
}

export interface JdTaxonomy {
  occupationFamily: OccupationFamily | null;
  specialization: string | null;
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

export interface BatchContextStore {
  updateResumeItem(batchId: string, resumeItemId: string, patch: ResumeItemPatch): Promise<void>;
  updateJdItem(batchId: string, jdItemId: string, patch: JdItemPatch): Promise<void>;
  upsertResult(
    batchId: string,
    resumeItemId: string,
    jdItemId: string,
    patch: ResultPatch,
  ): Promise<void>;

  incrementParseCompleted(batchId: string): Promise<CounterResult>;
  incrementScoreCompleted(batchId: string): Promise<ScoreCounterResult>;

  getResumeParsedData(batchId: string, resumeItemId: string): Promise<ParsedResumeData | null>;
  getJdParsedData(batchId: string, jdItemId: string): Promise<ParsedJobDescriptionData | null>;
  getJdTaxonomy(batchId: string, jdItemId: string): Promise<JdTaxonomy | null>;

  findCachedParsedResumeByChecksum(
    scope: { organizationId?: string; sessionId?: string },
    checksum: string,
  ): Promise<ParsedResumeData | null>;

  markBatchStatus(batchId: string, status: ScoringBatchStatus): Promise<void>;

  getBatchStatusOnly(batchId: string): Promise<ScoringBatchStatus>;

  getNotifyTarget(batchId: string): Promise<{ webhookUrl?: string | null; email?: string | null }>;

  getSuccessfullyParsedItemIds(
    batchId: string,
  ): Promise<{ resumeItemIds: string[]; jdItemIds: string[] }>;

  getBatchCriteria(batchId: string): Promise<import('../../common/types/ai-service.types').ScoreCriterionConfig[]>;

  getBatchTotals(
    batchId: string,
  ): Promise<{ totalCvCount: number; totalJdCount: number; totalPairCount: number }>;

  setBatchPairCount(batchId: string, totalPairCount: number): Promise<void>;
}
