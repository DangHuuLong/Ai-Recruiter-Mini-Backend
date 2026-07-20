// Typed payload shapes for the resume-parse, jd-parse, score-pair, and notify BullMQ jobs.
import { ScoreCriterionConfig } from '../../common/types/ai-service.types';
import { BatchTier } from '../queue.constants';

export interface ResumeParseJobData {
  batchId: string;
  tier: BatchTier;
  resumeItemId: string;
  storageKey?: string;
  bucket?: string;
  fileName?: string;
  fileType?: string;
  checksum?: string | null;
  organizationId?: string;
  sessionId?: string;
  rawText?: string;
}

export interface JdParseJobData {
  batchId: string;
  tier: BatchTier;
  jdItemId: string;
  rawText?: string;
  storageKey?: string;
  bucket?: string;
  fileName?: string;
  fileType?: string;
}

export interface ScorePairJobData {
  batchId: string;
  tier: BatchTier;
  resumeItemId: string;
  jdItemId: string;
  criteria: ScoreCriterionConfig[];
}

export interface NotifyJobData {
  batchId: string;
  tier: BatchTier;
  status: string;
  webhookUrl?: string | null;
  email?: string | null;
}
