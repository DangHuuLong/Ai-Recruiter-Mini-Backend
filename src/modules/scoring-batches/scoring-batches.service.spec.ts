import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { ScoringBatchesService } from './scoring-batches.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';
import { BatchProgressCoordinatorService } from '../../queue/batch-progress-coordinator.service';

function buildPrismaMock() {
  const evaluationConfigFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const fileAssetCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const scoringBatchFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const scoringBatchUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const scoringBatchResumeFindMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const scoringBatchJdFindMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const scoringBatchResultFindMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const scoringBatchResultFindUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const txScoringBatchCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txScoringBatchUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txScoringBatchResumeCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txScoringBatchJdCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      scoringBatch: { create: txScoringBatchCreate, update: txScoringBatchUpdate },
      scoringBatchResume: { create: txScoringBatchResumeCreate },
      scoringBatchJobDescription: { create: txScoringBatchJdCreate },
    }),
  );

  const prisma = {
    evaluationConfig: { findFirst: evaluationConfigFindFirst },
    fileAsset: { create: fileAssetCreate },
    scoringBatch: { findFirst: scoringBatchFindFirst, update: scoringBatchUpdate },
    scoringBatchResume: { findMany: scoringBatchResumeFindMany },
    scoringBatchJobDescription: { findMany: scoringBatchJdFindMany },
    scoringBatchResult: {
      findMany: scoringBatchResultFindMany,
      findUnique: scoringBatchResultFindUnique,
    },
    $transaction: transaction,
  } as unknown as PrismaService;

  return {
    prisma,
    evaluationConfigFindFirst,
    fileAssetCreate,
    scoringBatchFindFirst,
    scoringBatchUpdate,
    scoringBatchResumeFindMany,
    scoringBatchJdFindMany,
    scoringBatchResultFindMany,
    scoringBatchResultFindUnique,
    txScoringBatchCreate,
    txScoringBatchResumeCreate,
    txScoringBatchJdCreate,
  };
}

function buildStorageMock() {
  const getDefaultBucket = jest.fn<() => string>().mockReturnValue('cv-files');
  const objectExists = jest.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
  const downloadFile = jest.fn<(...args: unknown[]) => Promise<Buffer>>();
  const getPublicUrl = jest.fn().mockReturnValue('https://example.com/file');
  const createSignedUploadUrl = jest.fn<(...args: unknown[]) => Promise<string>>();

  const storageService = {
    getDefaultBucket,
    objectExists,
    downloadFile,
    getPublicUrl,
    createSignedUploadUrl,
  } as unknown as SupabaseStorageService;

  return { storageService, getDefaultBucket, objectExists, downloadFile, getPublicUrl };
}

function buildQueueMock() {
  const add = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  return { add } as unknown as Queue;
}

function buildCoordinatorMock() {
  const checkParseCompletion = jest.fn<(...args: unknown[]) => Promise<void>>();
  const coordinator = { checkParseCompletion } as unknown as BatchProgressCoordinatorService;
  return { coordinator, checkParseCompletion };
}

function buildConfigMock() {
  const get = jest.fn().mockReturnValue(undefined);
  const configService = { get } as unknown as ConfigService;
  return { configService, get };
}

function buildService(overrides?: { prismaMock?: ReturnType<typeof buildPrismaMock> }) {
  const prismaMock = overrides?.prismaMock ?? buildPrismaMock();
  const storageMock = buildStorageMock();
  const coordinatorMock = buildCoordinatorMock();
  const configMock = buildConfigMock();
  const resumeParseQueue = buildQueueMock();
  const jdParseQueue = buildQueueMock();

  const service = new ScoringBatchesService(
    prismaMock.prisma,
    configMock.configService,
    storageMock.storageService,
    coordinatorMock.coordinator,
    resumeParseQueue,
    jdParseQueue,
  );

  return { service, prismaMock, storageMock, coordinatorMock, configMock, resumeParseQueue, jdParseQueue };
}

describe('ScoringBatchesService.create', () => {
  it('throws 400 when no resume source is given', async () => {
    const { service } = buildService();

    await expect(
      service.create({ jobDescriptions: [{ rawText: 'a'.repeat(30) }] }, 'org-1', 'user-1'),
    ).rejects.toThrow(AppException);
  });

  it('throws 400 when no job description source is given', async () => {
    const { service } = buildService();

    await expect(
      service.create({ resumeTexts: [{ rawText: 'a'.repeat(30) }] }, 'org-1', 'user-1'),
    ).rejects.toThrow(AppException);
  });

  it('throws 400 when the job description count exceeds the configured max', async () => {
    const { service, configMock } = buildService();
    configMock.get.mockImplementation((key: unknown) =>
      key === 'ENTERPRISE_MAX_JDS_PER_BATCH' ? 1 : undefined,
    );

    await expect(
      service.create(
        {
          resumeTexts: [{ rawText: 'a'.repeat(30) }],
          jobDescriptions: [{ rawText: 'b'.repeat(30) }, { rawText: 'c'.repeat(30) }],
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('throws 404 when evaluationConfigId does not belong to the organization', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.evaluationConfigFindFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          resumeTexts: [{ rawText: 'a'.repeat(30) }],
          jobDescriptions: [{ rawText: 'b'.repeat(30) }],
          evaluationConfigId: 'missing-config',
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('creates a batch from text-only inputs, enqueues parse jobs, and reports checkParseCompletion', async () => {
    const { service, prismaMock, coordinatorMock, resumeParseQueue, jdParseQueue } = buildService();
    prismaMock.txScoringBatchCreate.mockResolvedValue({ id: 'batch-1' });
    prismaMock.txScoringBatchResumeCreate.mockResolvedValue({ id: 'resume-item-1', rawText: 'a'.repeat(30) });
    prismaMock.txScoringBatchJdCreate.mockResolvedValue({ id: 'jd-item-1', rawText: 'b'.repeat(30) });

    const result = await service.create(
      {
        resumeTexts: [{ rawText: 'a'.repeat(30) }],
        jobDescriptions: [{ rawText: 'b'.repeat(30) }],
      },
      'org-1',
      'user-1',
    );

    expect(result).toEqual({
      batchId: 'batch-1',
      status: 'PARSING',
      totalCvCount: 1,
      totalJdCount: 1,
    });
    expect(resumeParseQueue.add).toHaveBeenCalledWith(
      'resume-parse',
      expect.objectContaining({ batchId: 'batch-1', resumeItemId: 'resume-item-1', tier: 'ENTERPRISE' }),
      expect.anything(),
    );
    expect(jdParseQueue.add).toHaveBeenCalledWith(
      'jd-parse',
      expect.objectContaining({ batchId: 'batch-1', jdItemId: 'jd-item-1', tier: 'ENTERPRISE' }),
      expect.anything(),
    );
    expect(coordinatorMock.checkParseCompletion).toHaveBeenCalledWith('batch-1', 'ENTERPRISE');
  });

  it('marks structured resume/JD items as already-SUCCESS and does not enqueue parse jobs for them', async () => {
    const { service, prismaMock, resumeParseQueue, jdParseQueue } = buildService();
    prismaMock.txScoringBatchCreate.mockResolvedValue({ id: 'batch-2' });
    prismaMock.txScoringBatchResumeCreate.mockResolvedValue({ id: 'resume-item-2' });
    prismaMock.txScoringBatchJdCreate.mockResolvedValue({ id: 'jd-item-2' });

    await service.create(
      {
        resumeStructured: [{ label: 'Jane Doe' }],
        jobDescriptionStructured: [{ title: 'Backend Engineer' }],
      },
      'org-1',
      'user-1',
    );

    expect(prismaMock.txScoringBatchResumeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
    expect(prismaMock.txScoringBatchJdCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUCCESS' }) }),
    );
    expect(resumeParseQueue.add).not.toHaveBeenCalled();
    expect(jdParseQueue.add).not.toHaveBeenCalled();
  });

  it('throws 400 when an uploaded file checksum does not match the declared checksum', async () => {
    const { service, storageMock } = buildService();
    storageMock.downloadFile.mockResolvedValue(Buffer.from('actual file bytes'));

    await expect(
      service.create(
        {
          resumeFiles: [
            {
              fileKey: 'scoring-batches/org-1/file.pdf',
              fileName: 'resume.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 100,
              checksum: '0'.repeat(64),
            },
          ],
          jobDescriptions: [{ rawText: 'b'.repeat(30) }],
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toThrow(AppException);
  });
});

describe('ScoringBatchesService.cancel', () => {
  it('throws 404 when the batch does not belong to the organization', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue(null);

    await expect(service.cancel('batch-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('throws 409 when the batch is already in a terminal status', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1', status: 'COMPLETED' });

    await expect(service.cancel('batch-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('cancels a non-terminal batch', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1', status: 'SCORING' });
    prismaMock.scoringBatchUpdate.mockResolvedValue({ id: 'batch-1', status: 'CANCELLED' });

    await expect(service.cancel('batch-1', 'org-1')).resolves.toEqual({
      batchId: 'batch-1',
      status: 'CANCELLED',
    });
  });
});

describe('ScoringBatchesService.getCell', () => {
  it('throws 404 when the cell exists but belongs to a different batch', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1' });
    prismaMock.scoringBatchResultFindUnique.mockResolvedValue({ batchId: 'other-batch' });

    await expect(service.getCell('batch-1', 'resume-1', 'jd-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('returns the cell when it belongs to the requested batch', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1' });
    const cell = { batchId: 'batch-1', resumeItemId: 'resume-1', jdItemId: 'jd-1', overallScore: 82 };
    prismaMock.scoringBatchResultFindUnique.mockResolvedValue(cell);

    await expect(service.getCell('batch-1', 'resume-1', 'jd-1', 'org-1')).resolves.toEqual(cell);
  });
});

describe('ScoringBatchesService.getMatrix', () => {
  it('ranks topN JDs per row by overallScore descending, dropping unscored cells', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1', status: 'COMPLETED' });
    prismaMock.scoringBatchResumeFindMany.mockResolvedValue([
      { id: 'resume-1', candidateLabel: 'Jane', status: 'SUCCESS', parsingError: null, fileAsset: null },
    ]);
    prismaMock.scoringBatchJdFindMany.mockResolvedValue([]);
    prismaMock.scoringBatchResultFindMany.mockResolvedValue([
      { resumeItemId: 'resume-1', jdItemId: 'jd-1', status: 'COMPLETED', overallScore: 40, error: null },
      { resumeItemId: 'resume-1', jdItemId: 'jd-2', status: 'COMPLETED', overallScore: 90, error: null },
      { resumeItemId: 'resume-1', jdItemId: 'jd-3', status: 'FAILED', overallScore: null, error: 'boom' },
    ]);

    const result = await service.getMatrix('batch-1', 'org-1', { limit: 10, topN: 1 } as never);

    expect(result.rows[0].topJds).toEqual([{ jdItemId: 'jd-2', score: 90 }]);
  });
});

describe('ScoringBatchesService.getSkillGapSummary', () => {
  it('counts MISSING skills across completed results and sorts by frequency descending', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1' });
    prismaMock.scoringBatchResultFindMany.mockResolvedValue([
      { skills: [{ skillName: 'Docker', type: 'MISSING' }, { skillName: 'AWS', type: 'MATCHED' }] },
      { skills: [{ skillName: 'Docker', type: 'MISSING' }, { skillName: 'Kubernetes', type: 'MISSING' }] },
    ]);

    const result = await service.getSkillGapSummary('batch-1', 'org-1', {} as never);

    expect(result.missingSkills).toEqual([
      { skillName: 'Docker', missingCount: 2 },
      { skillName: 'Kubernetes', missingCount: 1 },
    ]);
  });
});

describe('ScoringBatchesService.exportCsv', () => {
  it('quotes candidate names containing commas and places scores in the right cell', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.scoringBatchFindFirst.mockResolvedValue({ id: 'batch-1' });
    prismaMock.scoringBatchResumeFindMany.mockResolvedValue([
      { id: 'resume-1', candidateLabel: 'Doe, Jane', fileAsset: null },
    ]);
    prismaMock.scoringBatchJdFindMany.mockResolvedValue([{ id: 'jd-1', label: 'Backend' }]);
    prismaMock.scoringBatchResultFindMany.mockResolvedValue([
      { resumeItemId: 'resume-1', jdItemId: 'jd-1', overallScore: 77 },
    ]);

    const csv = await service.exportCsv('batch-1', 'org-1');

    expect(csv).toBe('Candidate,Backend\n"Doe, Jane",77');
  });
});
