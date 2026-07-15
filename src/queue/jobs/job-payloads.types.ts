import { ScoreCriterionConfig } from '../../common/types/ai-service.types';
import { BatchTier } from '../queue.constants';

// Exactly one of the file-based fields (storageKey/bucket/fileName/fileType)
// or rawText is expected to be set — mirrors the AI service's own
// signed_url-vs-raw_text /parse/resume contract (see docs in that repo).
// checksum-based caching only applies to the file-based path (there's no
// natural checksum for pasted text).
export interface ResumeParseJobData {
  batchId: string;
  tier: BatchTier;
  resumeItemId: string;
  storageKey?: string;
  bucket?: string;
  fileName?: string;
  fileType?: string;
  checksum?: string | null;
  organizationId?: string; // used for checksum-cache scoping (ENTERPRISE only)
  sessionId?: string; // used for checksum-cache scoping (PUBLIC only)
  rawText?: string;
}

// Same either/or rule as ResumeParseJobData, mirroring the AI service's
// /parse/job-description signed_url-vs-raw_text contract.
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
