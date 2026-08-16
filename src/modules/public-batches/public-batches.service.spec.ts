import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { PublicBatchesService } from './public-batches.service';
import { RedisBatchContextStore } from './redis-batch-context.store';
import { AppException } from '../../common/exceptions/app.exception';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';
import { BatchProgressCoordinatorService } from '../../queue/batch-progress-coordinator.service';

function buildRedisStoreMock() {
  const createBatch = jest.fn<(...args: unknown[]) => Promise<void>>();
  const addResumeItem = jest.fn<(...args: unknown[]) => Promise<void>>();
  const addJdItem = jest.fn<(...args: unknown[]) => Promise<void>>();
  const markBatchStatus = jest.fn<(...args: unknown[]) => Promise<void>>();
  const getBatchSnapshot = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const redisStore = {
    createBatch,
    addResumeItem,
    addJdItem,
    markBatchStatus,
    getBatchSnapshot,
  } as unknown as RedisBatchContextStore;

  return { redisStore, createBatch, addResumeItem, addJdItem, markBatchStatus, getBatchSnapshot };
}

function buildStorageMock() {
  const objectExists = jest.fn<(...args: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
  const downloadFile = jest.fn<(...args: unknown[]) => Promise<Buffer>>();
  const createSignedUploadUrl = jest.fn<(...args: unknown[]) => Promise<string>>();

  const storageService = {
    objectExists,
    downloadFile,
    createSignedUploadUrl,
  } as unknown as SupabaseStorageService;

  return { storageService, objectExists, downloadFile, createSignedUploadUrl };
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

function buildService() {
  const redisMock = buildRedisStoreMock();
  const storageMock = buildStorageMock();
  const coordinatorMock = buildCoordinatorMock();
  const configMock = buildConfigMock();
  const resumeParseQueue = buildQueueMock();
  const jdParseQueue = buildQueueMock();

  const service = new PublicBatchesService(
    configMock.configService,
    storageMock.storageService,
    redisMock.redisStore,
    coordinatorMock.coordinator,
    resumeParseQueue,
    jdParseQueue,
  );

  return { service, redisMock, storageMock, coordinatorMock, configMock, resumeParseQueue, jdParseQueue };
}

describe('PublicBatchesService.create', () => {
  it('throws 400 when no resume source is given', async () => {
    const { service } = buildService();

    await expect(
      service.create({ jobDescriptions: [{ rawText: 'a'.repeat(30) }] }, 'session-1'),
    ).rejects.toThrow(AppException);
  });

  it('throws 400 when no job description source is given', async () => {
    const { service } = buildService();

    await expect(
      service.create({ resumeTexts: [{ rawText: 'a'.repeat(30) }] }, 'session-1'),
    ).rejects.toThrow(AppException);
  });

  it('throws 400 when the resume count exceeds the public per-batch max', async () => {
    const { service, configMock } = buildService();
    configMock.get.mockImplementation((key: unknown) =>
      key === 'PUBLIC_MAX_FILES_PER_BATCH' ? 1 : undefined,
    );

    await expect(
      service.create(
        {
          resumeTexts: [{ rawText: 'a'.repeat(30) }, { rawText: 'b'.repeat(30) }],
          jobDescriptions: [{ rawText: 'c'.repeat(30) }],
        },
        'session-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('seeds the Redis store from text-only inputs, enqueues parse jobs, and reports checkParseCompletion', async () => {
    const { service, redisMock, coordinatorMock, resumeParseQueue, jdParseQueue } = buildService();

    const result = await service.create(
      {
        resumeTexts: [{ rawText: 'a'.repeat(30) }],
        jobDescriptions: [{ rawText: 'b'.repeat(30) }],
      },
      'session-1',
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 'PARSING', totalCvCount: 1, totalJdCount: 1 }),
    );
    expect(redisMock.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({ ownerSessionId: 'session-1', totalCvCount: 1, totalJdCount: 1 }),
    );
    expect(redisMock.markBatchStatus).toHaveBeenCalledWith(result.batchId, 'PARSING');
    expect(resumeParseQueue.add).toHaveBeenCalledWith(
      'resume-parse',
      expect.objectContaining({ batchId: result.batchId, tier: 'PUBLIC', sessionId: 'session-1' }),
      expect.anything(),
    );
    expect(jdParseQueue.add).toHaveBeenCalledWith(
      'jd-parse',
      expect.objectContaining({ batchId: result.batchId, tier: 'PUBLIC' }),
      expect.anything(),
    );
    expect(coordinatorMock.checkParseCompletion).toHaveBeenCalledWith(result.batchId, 'PUBLIC');
  });

  it('marks structured resume/JD items as already-SUCCESS in Redis and does not enqueue parse jobs for them', async () => {
    const { service, redisMock, resumeParseQueue, jdParseQueue } = buildService();

    await service.create(
      {
        resumeStructured: [{ label: 'Jane Doe' }],
        jobDescriptionStructured: [{ title: 'Backend Engineer' }],
      },
      'session-1',
    );

    expect(redisMock.addResumeItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'SUCCESS' }),
    );
    expect(redisMock.addJdItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'SUCCESS' }),
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
              fileKey: 'public/session-1/file.pdf',
              fileName: 'resume.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 100,
              checksum: '0'.repeat(64),
            },
          ],
          jobDescriptions: [{ rawText: 'b'.repeat(30) }],
        },
        'session-1',
      ),
    ).rejects.toThrow(AppException);
  });
});

describe('PublicBatchesService.findOne', () => {
  it('throws 404 when no snapshot exists for the batch id', async () => {
    const { service, redisMock } = buildService();
    redisMock.getBatchSnapshot.mockResolvedValue(null);

    await expect(service.findOne('batch-1', 'session-1')).rejects.toThrow(AppException);
  });

  it('throws (not leaking existence via a different status) when the session does not own the batch', async () => {
    const { service, redisMock } = buildService();
    redisMock.getBatchSnapshot.mockResolvedValue({
      meta: { id: 'batch-1', ownerSessionId: 'someone-else' },
    });

    await expect(service.findOne('batch-1', 'session-1')).rejects.toThrow(AppException);
  });

  it('returns the shaped snapshot when the session matches the owner', async () => {
    const { service, redisMock } = buildService();
    redisMock.getBatchSnapshot.mockResolvedValue({
      meta: {
        id: 'batch-1',
        ownerSessionId: 'session-1',
        name: 'My batch',
        status: 'COMPLETED',
        totalCvCount: 1,
        totalJdCount: 1,
        totalPairCount: 1,
        completedPairCount: 1,
        failedPairCount: 0,
        startedAt: null,
        completedAt: null,
      },
      resumeItems: [],
      jdItems: [],
      results: [],
    });

    const result = await service.findOne('batch-1', 'session-1');

    expect(result).toEqual(
      expect.objectContaining({
        batchId: 'batch-1',
        status: 'COMPLETED',
        progress: expect.objectContaining({ totalCvCount: 1, completedPairCount: 1 }),
      }),
    );
  });
});
