import { describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ScorePairProcessor } from './score-pair.processor';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { ScoringResultMapperService } from '../../modules/evaluations/scoring/scoring.service';
import { AiService } from '../../integrations/ai/ai.service';

function buildStoreMock() {
  const getBatchStatusOnly = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('SCORING');
  const getResumeParsedData = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ skills: [] });
  const getJdParsedData = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ title: 'x' });
  const getJdTaxonomy = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(null);
  const upsertResult = jest.fn<(...args: unknown[]) => Promise<void>>();

  const store = { getBatchStatusOnly, getResumeParsedData, getJdParsedData, getJdTaxonomy, upsertResult };
  return { store, getBatchStatusOnly, getResumeParsedData, getJdParsedData, getJdTaxonomy, upsertResult };
}

function buildService() {
  const storeMock = buildStoreMock();
  const forTier = jest.fn().mockReturnValue(storeMock.store);
  const storeFactory = { forTier } as unknown as BatchContextStoreFactory;

  const scoreApplication = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const aiService = { scoreApplication } as unknown as AiService;

  const mapCriteria = jest.fn().mockReturnValue([]);
  const mapSkills = jest.fn().mockReturnValue([]);
  const buildInterviewQuestions = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]);
  const scoringMapper = { mapCriteria, mapSkills, buildInterviewQuestions } as unknown as ScoringResultMapperService;

  const processor = new ScorePairProcessor(storeFactory, aiService, scoringMapper);

  return { processor, storeMock, scoreApplication, scoringMapper, mapCriteria, mapSkills, buildInterviewQuestions };
}

function buildJob(data: Record<string, unknown>): Job<never> {
  return { data } as unknown as Job<never>;
}

const BASE_JOB_DATA = { batchId: 'batch-1', tier: 'ENTERPRISE', resumeItemId: 'resume-1', jdItemId: 'jd-1' };

describe('ScorePairProcessor.process', () => {
  it('does nothing when the batch has already been cancelled', async () => {
    const { processor, storeMock, scoreApplication } = buildService();
    storeMock.getBatchStatusOnly.mockResolvedValue('CANCELLED');

    await processor.process(buildJob(BASE_JOB_DATA));

    expect(scoreApplication).not.toHaveBeenCalled();
    expect(storeMock.upsertResult).not.toHaveBeenCalled();
  });

  it('marks the pair FAILED without calling the AI service when resume data is missing', async () => {
    const { processor, storeMock, scoreApplication } = buildService();
    storeMock.getResumeParsedData.mockResolvedValue(null);

    await processor.process(buildJob(BASE_JOB_DATA));

    expect(scoreApplication).not.toHaveBeenCalled();
    expect(storeMock.upsertResult).toHaveBeenCalledWith('batch-1', 'resume-1', 'jd-1', {
      status: 'FAILED',
      error: 'Missing parsed resume or job description data',
    });
  });

  it('marks the pair FAILED without calling the AI service when JD data is missing', async () => {
    const { processor, storeMock, scoreApplication } = buildService();
    storeMock.getJdParsedData.mockResolvedValue(null);

    await processor.process(buildJob(BASE_JOB_DATA));

    expect(scoreApplication).not.toHaveBeenCalled();
    expect(storeMock.upsertResult).toHaveBeenCalledWith('batch-1', 'resume-1', 'jd-1', {
      status: 'FAILED',
      error: 'Missing parsed resume or job description data',
    });
  });

  it('scores the pair and persists a COMPLETED result, rounding overallScore to 2 decimals', async () => {
    const { processor, storeMock, scoreApplication, buildInterviewQuestions } = buildService();
    scoreApplication.mockResolvedValue({
      overall_score: 77.4567,
      summary: 'Strong match',
      explanation: 'Detailed reasoning',
      skill_gap_summary: 'Missing Docker',
      evidence_map: { matched: [] },
    });
    buildInterviewQuestions.mockResolvedValue([{ question: 'Tell me about caching' }]);

    await processor.process(buildJob(BASE_JOB_DATA));

    expect(storeMock.upsertResult).toHaveBeenCalledWith(
      'batch-1',
      'resume-1',
      'jd-1',
      expect.objectContaining({
        status: 'COMPLETED',
        overallScore: 77.46,
        summary: 'Strong match',
        interviewQuestions: [{ question: 'Tell me about caching' }],
      }),
    );
  });

  it('rethrows on a retryable (502/504) error so BullMQ retries the job', async () => {
    const { processor, scoreApplication } = buildService();
    const httpError = new HttpException('Bad Gateway', 502);
    scoreApplication.mockRejectedValue(httpError);

    await expect(processor.process(buildJob(BASE_JOB_DATA))).rejects.toBe(httpError);
  });

  it('swallows a non-retryable error, marking the pair FAILED instead of throwing', async () => {
    const { processor, storeMock, scoreApplication } = buildService();
    scoreApplication.mockRejectedValue(new Error('AI service unavailable'));

    await expect(processor.process(buildJob(BASE_JOB_DATA))).resolves.toBeUndefined();
    expect(storeMock.upsertResult).toHaveBeenCalledWith('batch-1', 'resume-1', 'jd-1', {
      status: 'FAILED',
      error: 'AI service unavailable',
    });
  });
});
