import { describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import type { Job } from 'bullmq';

import { JdParseProcessor } from './jd-parse.processor';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { AiService } from '../../integrations/ai/ai.service';
import { JobDescriptionClassifierService } from '../../modules/job-descriptions/job-description-classifier.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

function buildStoreMock() {
  const getBatchStatusOnly = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('SCORING');
  const updateJdItem = jest.fn<(...args: unknown[]) => Promise<void>>();

  const store = { getBatchStatusOnly, updateJdItem };
  return { store, getBatchStatusOnly, updateJdItem };
}

function buildService() {
  const storeMock = buildStoreMock();
  const forTier = jest.fn().mockReturnValue(storeMock.store);
  const storeFactory = { forTier } as unknown as BatchContextStoreFactory;

  const parseJobDescription = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const aiService = { parseJobDescription } as unknown as AiService;

  const createSignedUrl = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('https://signed.example');
  const removeFile = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const storageService = { createSignedUrl, removeFile } as unknown as SupabaseStorageService;

  const classify = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(null);
  const classifierService = { classify } as unknown as JobDescriptionClassifierService;

  const processor = new JdParseProcessor(storeFactory, aiService, storageService, classifierService);

  return { processor, storeMock, parseJobDescription, removeFile, classify };
}

function buildJob(data: Record<string, unknown>): Job<never> {
  return { data } as unknown as Job<never>;
}

describe('JdParseProcessor.process', () => {
  it('does nothing when the batch has already been cancelled', async () => {
    const { processor, storeMock, parseJobDescription } = buildService();
    storeMock.getBatchStatusOnly.mockResolvedValue('CANCELLED');

    await processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', jdItemId: 'jd-1', rawText: 'x'.repeat(30) }));

    expect(parseJobDescription).not.toHaveBeenCalled();
    expect(storeMock.updateJdItem).not.toHaveBeenCalled();
  });

  it('parses successfully and merges the classification (occupationFamily/specialization) into the item', async () => {
    const { processor, storeMock, parseJobDescription, classify } = buildService();
    parseJobDescription.mockResolvedValue({ title: 'Backend Engineer' });
    classify.mockResolvedValue({ occupationFamily: 'IT', specialization: 'Backend' });

    await processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', jdItemId: 'jd-1', rawText: 'x'.repeat(30) }));

    expect(storeMock.updateJdItem).toHaveBeenCalledWith('batch-1', 'jd-1', {
      status: 'SUCCESS',
      parsedData: { title: 'Backend Engineer' },
      occupationFamily: 'IT',
      specialization: 'Backend',
    });
  });

  it('writes null occupationFamily/specialization when classification comes back null', async () => {
    const { processor, storeMock, parseJobDescription, classify } = buildService();
    parseJobDescription.mockResolvedValue({ title: 'Senior Accountant' });
    classify.mockResolvedValue(null);

    await processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', jdItemId: 'jd-1', rawText: 'x'.repeat(30) }));

    expect(storeMock.updateJdItem).toHaveBeenCalledWith('batch-1', 'jd-1', {
      status: 'SUCCESS',
      parsedData: { title: 'Senior Accountant' },
      occupationFamily: null,
      specialization: null,
    });
  });

  it('rethrows on a retryable (502/504) error so BullMQ retries the job', async () => {
    const { processor, parseJobDescription } = buildService();
    const httpError = new HttpException('Gateway Timeout', 504);
    parseJobDescription.mockRejectedValue(httpError);

    await expect(
      processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', jdItemId: 'jd-1', rawText: 'x'.repeat(30) })),
    ).rejects.toBe(httpError);
  });

  it('swallows a non-retryable error, marking the item FAILED instead of throwing', async () => {
    const { processor, storeMock, parseJobDescription } = buildService();
    parseJobDescription.mockRejectedValue(new Error('malformed JD'));

    await expect(
      processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', jdItemId: 'jd-1', rawText: 'x'.repeat(30) })),
    ).resolves.toBeUndefined();
    expect(storeMock.updateJdItem).toHaveBeenCalledWith('batch-1', 'jd-1', {
      status: 'FAILED',
      parsingError: 'malformed JD',
    });
  });

  it('deletes the temp file for a PUBLIC tier file-based item', async () => {
    const { processor, removeFile, parseJobDescription, classify } = buildService();
    parseJobDescription.mockResolvedValue({ title: 'x' });
    classify.mockResolvedValue(null);

    await processor.process(
      buildJob({ batchId: 'batch-1', tier: 'PUBLIC', jdItemId: 'jd-1', storageKey: 'key-1', bucket: 'file-public' }),
    );

    expect(removeFile).toHaveBeenCalledWith('key-1', 'file-public');
  });
});
