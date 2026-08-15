import { describe, expect, it, jest } from '@jest/globals';

import { AiActivityFeedbackService } from './ai-activity-feedback.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const create = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const prisma = { aiActivityFeedback: { create } } as unknown as PrismaService;
  return { prisma, create };
}

describe('AiActivityFeedbackService.submitEvaluationFeedback', () => {
  it('throws 400 when accuracy is not ACCURATE and no reasons are given', async () => {
    const { prisma } = buildPrismaMock();
    const service = new AiActivityFeedbackService(prisma);

    await expect(
      service.submitEvaluationFeedback('eval-1', 'org-1', {
        accuracy: 'INACCURATE',
        speed: 'NORMAL',
      }),
    ).rejects.toThrow(AppException);
  });

  it('throws 400 when accuracy is OK and reasons is an empty array', async () => {
    const { prisma } = buildPrismaMock();
    const service = new AiActivityFeedbackService(prisma);

    await expect(
      service.submitEvaluationFeedback('eval-1', 'org-1', {
        accuracy: 'OK',
        reasons: [],
        speed: 'SLOW',
      }),
    ).rejects.toThrow(AppException);
  });

  it('allows ACCURATE with no reasons and records tier ENTERPRISE + organizationId/evaluationId', async () => {
    const { prisma, create } = buildPrismaMock();
    create.mockResolvedValue({ id: 'fb-1' });
    const service = new AiActivityFeedbackService(prisma);

    const result = await service.submitEvaluationFeedback('eval-1', 'org-1', {
      accuracy: 'ACCURATE',
      speed: 'FAST',
    });

    expect(result).toEqual({ id: 'fb-1' });
    expect(create).toHaveBeenCalledWith({
      data: {
        tier: 'ENTERPRISE',
        accuracy: 'ACCURATE',
        reasons: [],
        speed: 'FAST',
        comment: null,
        organizationId: 'org-1',
        evaluationId: 'eval-1',
      },
    });
  });

  it('passes through reasons and comment when provided', async () => {
    const { prisma, create } = buildPrismaMock();
    create.mockResolvedValue({ id: 'fb-2' });
    const service = new AiActivityFeedbackService(prisma);

    await service.submitEvaluationFeedback('eval-2', 'org-1', {
      accuracy: 'INACCURATE',
      reasons: ['SCORE_TOO_LOW', 'MISSING_SKILLS'],
      speed: 'SLOW',
      comment: 'missed the Docker skill',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reasons: ['SCORE_TOO_LOW', 'MISSING_SKILLS'],
        comment: 'missed the Docker skill',
      }),
    });
  });
});

describe('AiActivityFeedbackService.submitPublicFeedback', () => {
  it('throws 400 when accuracy is not ACCURATE and no reasons are given', async () => {
    const { prisma } = buildPrismaMock();
    const service = new AiActivityFeedbackService(prisma);

    await expect(
      service.submitPublicFeedback({
        accuracy: 'OK',
        speed: 'NORMAL',
        batchId: 'batch-1',
        resumeItemId: 'resume-1',
        jdItemId: 'jd-1',
      }),
    ).rejects.toThrow(AppException);
  });

  it('records tier PUBLIC with batchId/resumeId/jobDescriptionId, and no organizationId/evaluationId', async () => {
    const { prisma, create } = buildPrismaMock();
    create.mockResolvedValue({ id: 'fb-3' });
    const service = new AiActivityFeedbackService(prisma);

    await service.submitPublicFeedback({
      accuracy: 'ACCURATE',
      speed: 'FAST',
      batchId: 'batch-1',
      resumeItemId: 'resume-1',
      jdItemId: 'jd-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tier: 'PUBLIC',
        accuracy: 'ACCURATE',
        reasons: [],
        speed: 'FAST',
        comment: null,
        batchId: 'batch-1',
        resumeId: 'resume-1',
        jobDescriptionId: 'jd-1',
      },
    });
  });
});
