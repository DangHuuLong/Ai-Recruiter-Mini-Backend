import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queue.constants';
import { ScorePairJobData } from '../jobs/job-payloads.types';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { EvaluationResult } from '../../common/types/ai-service.types';
import { AiService } from '../../integrations/ai/ai.service';

const RETRYABLE_STATUS_CODES = new Set([502, 504]);

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

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
  ) {
    super();
  }

  async process(job: Job<ScorePairJobData>): Promise<void> {
    const { batchId, tier, resumeItemId, jdItemId, criteria } = job.data;
    const store = this.storeFactory.forTier(tier);

    try {
      const [resumeData, jdData] = await Promise.all([
        store.getResumeParsedData(batchId, resumeItemId),
        store.getJdParsedData(batchId, jdItemId),
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

      await store.upsertResult(batchId, resumeItemId, jdItemId, {
        status: 'COMPLETED',
        overallScore: Math.round(result.overall_score * 100) / 100,
        summary: result.summary,
        criteria: this.mapCriteria(result),
        skills: this.mapSkills(result),
        explanation: result.explanation,
        skillGapSummary: result.skill_gap_summary,
        interviewQuestions: this.mapInterviewQuestions(result),
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

  private mapCriteria(result: EvaluationResult) {
    return result.criteria.map((item) => ({
      criterion: item.criterion,
      weight: clamp01(item.weight),
      scoreNormalized: clamp01(item.score_normalized),
      reason: item.reason,
      evidence: item.evidence,
    }));
  }

  private mapSkills(result: EvaluationResult) {
    return result.skills.map((item) => ({
      skillName: item.skill_name,
      normalizedSkillName: item.normalized_skill_name,
      type: item.type,
      importance: item.importance,
      evidence: item.evidence,
      note: item.note,
    }));
  }

  private mapInterviewQuestions(result: EvaluationResult) {
    return result.interview_questions.map((item, index) => ({
      question: item.question,
      category: item.category,
      linkedSkill: item.linked_skill,
      difficulty: item.difficulty,
      rationale: item.rationale,
      displayOrder: item.display_order ?? index + 1,
    }));
  }
}
