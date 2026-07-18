import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queue.constants';
import { ScorePairJobData } from '../jobs/job-payloads.types';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { ScoringResultMapperService } from '../../modules/evaluations/scoring/scoring.service';
import { AiService } from '../../integrations/ai/ai.service';

const RETRYABLE_STATUS_CODES = new Set([502, 504]);

@Processor(QUEUE_NAMES.SCORE_PAIR, {
  // Deliberately low default — this is the CrossEncoder bottleneck queue on
  // the AI service side (no cacheable embeddings, one full forward pass per
  // pair). Raising this only saturates the AI service faster, it does not
  // speed up throughput. See PLAN.md Phase 2 for the full rationale.
  concurrency: process.env.AI_SCORE_CONCURRENCY ? Number(process.env.AI_SCORE_CONCURRENCY) : 4,
})
export class ScorePairProcessor extends WorkerHost {
  private readonly logger = new Logger(ScorePairProcessor.name);

  constructor(
    private readonly storeFactory: BatchContextStoreFactory,
    private readonly aiService: AiService,
    private readonly scoringMapper: ScoringResultMapperService,
  ) {
    super();
  }

  async process(job: Job<ScorePairJobData>): Promise<void> {
    const { batchId, tier, resumeItemId, jdItemId, criteria } = job.data;
    const store = this.storeFactory.forTier(tier);

    if ((await store.getBatchStatusOnly(batchId)) === 'CANCELLED') {
      return;
    }

    try {
      const [resumeData, jdData, taxonomy] = await Promise.all([
        store.getResumeParsedData(batchId, resumeItemId),
        store.getJdParsedData(batchId, jdItemId),
        store.getJdTaxonomy(batchId, jdItemId),
      ]);

      if (!resumeData || !jdData) {
        // Should not happen — the coordinator only enqueues score-pair jobs
        // for items that finished parsing successfully — but guard anyway.
        await store.upsertResult(batchId, resumeItemId, jdItemId, {
          status: 'FAILED',
          error: 'Missing parsed resume or job description data',
        });
        return;
      }

      const result = await this.aiService.scoreApplication(resumeData, jdData, criteria);
      const interviewQuestions = await this.scoringMapper.buildInterviewQuestions(taxonomy, result);

      await store.upsertResult(batchId, resumeItemId, jdItemId, {
        status: 'COMPLETED',
        overallScore: Math.round(result.overall_score * 100) / 100,
        summary: result.summary,
        criteria: this.scoringMapper.mapCriteria(result),
        skills: this.scoringMapper.mapSkills(result),
        explanation: result.explanation,
        skillGapSummary: result.skill_gap_summary,
        interviewQuestions,
        evidenceMap: result.evidence_map,
      });
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;

      if (RETRYABLE_STATUS_CODES.has(statusCode)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Scoring failed';
      this.logger.warn(
        `Scoring failed for batch ${batchId} (resume ${resumeItemId} x jd ${jdItemId}): ${message}`,
      );
      await store.upsertResult(batchId, resumeItemId, jdItemId, { status: 'FAILED', error: message });
    }
  }
}
