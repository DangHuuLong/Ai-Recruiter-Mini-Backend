import { describe, expect, it, jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ResumeParseProcessor } from './resume-parse.processor';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { AiService } from '../../integrations/ai/ai.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

function buildStoreMock() {
  const getBatchStatusOnly = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('SCORING');
  const findCachedParsedResumeByChecksum = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(null);
  const updateResumeItem = jest.fn<(...args: unknown[]) => Promise<void>>();

  const store = { getBatchStatusOnly, findCachedParsedResumeByChecksum, updateResumeItem };
  return { store, getBatchStatusOnly, findCachedParsedResumeByChecksum, updateResumeItem };
}

function buildService() {
  const storeMock = buildStoreMock();
  const forTier = jest.fn().mockReturnValue(storeMock.store);
  const storeFactory = { forTier } as unknown as BatchContextStoreFactory;

  const parseResume = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const aiService = { parseResume } as unknown as AiService;

  const createSignedUrl = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('https://signed.example');
  const removeFile = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const storageService = { createSignedUrl, removeFile } as unknown as SupabaseStorageService;

  const processor = new ResumeParseProcessor(storeFactory, aiService, storageService);

  return { processor, storeMock, parseResume, removeFile };
}

function buildJob(data: Record<string, unknown>): Job<never> {
  return { data } as unknown as Job<never>;
}

describe('ResumeParseProcessor.process', () => {
  it('does nothing when the batch has already been cancelled', async () => {
    const { processor, storeMock, parseResume } = buildService();
    storeMock.getBatchStatusOnly.mockResolvedValue('CANCELLED');

    await processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', resumeItemId: 'item-1', rawText: 'x'.repeat(30) }));

    expect(parseResume).not.toHaveBeenCalled();
    expect(storeMock.updateResumeItem).not.toHaveBeenCalled();
  });

  it('skips the AI call and reuses a checksum-cached parse result for file-based items', async () => {
    const { processor, storeMock, parseResume } = buildService();
    storeMock.findCachedParsedResumeByChecksum.mockResolvedValue({ skills: ['Docker'] });

    await processor.process(
      buildJob({
        batchId: 'batch-1',
        tier: 'ENTERPRISE',
        resumeItemId: 'item-1',
        storageKey: 'key-1',
        bucket: 'cv-files',
        checksum: 'abc123',
      }),
    );

    expect(parseResume).not.toHaveBeenCalled();
    expect(storeMock.updateResumeItem).toHaveBeenCalledWith('batch-1', 'item-1', {
      status: 'SUCCESS',
      parsedData: { skills: ['Docker'] },
    });
  });

  it('calls the AI service and records SUCCESS on a cache miss', async () => {
    const { processor, storeMock, parseResume } = buildService();
    parseResume.mockResolvedValue({ raw_text: 'parsed', parsed_data: { skills: ['AWS'] } });

    await processor.process(
      buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', resumeItemId: 'item-1', rawText: 'x'.repeat(30) }),
    );

    expect(storeMock.updateResumeItem).toHaveBeenCalledWith('batch-1', 'item-1', {
      status: 'SUCCESS',
      rawText: 'parsed',
      parsedData: { skills: ['AWS'] },
    });
  });

  it('rethrows on a retryable (502/504) error so BullMQ retries the job', async () => {
    const { processor, parseResume } = buildService();
    const httpError = new HttpException('Bad Gateway', 502);
    parseResume.mockRejectedValue(httpError);

    await expect(
      processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', resumeItemId: 'item-1', rawText: 'x'.repeat(30) })),
    ).rejects.toBe(httpError);
  });

  it('swallows a non-retryable error, marking the item FAILED instead of throwing', async () => {
    const { processor, storeMock, parseResume } = buildService();
    parseResume.mockRejectedValue(new Error('malformed CV'));

    await expect(
      processor.process(buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', resumeItemId: 'item-1', rawText: 'x'.repeat(30) })),
    ).resolves.toBeUndefined();
    expect(storeMock.updateResumeItem).toHaveBeenCalledWith('batch-1', 'item-1', {
      status: 'FAILED',
      parsingError: 'malformed CV',
    });
  });

  it('deletes the temp file for a PUBLIC tier file-based item, even after a parse failure', async () => {
    const { processor, removeFile, parseResume } = buildService();
    parseResume.mockRejectedValue(new Error('boom'));

    await processor.process(
      buildJob({
        batchId: 'batch-1',
        tier: 'PUBLIC',
        resumeItemId: 'item-1',
        storageKey: 'key-1',
        bucket: 'file-public',
      }),
    );

    expect(removeFile).toHaveBeenCalledWith('key-1', 'file-public');
  });

  it('does not attempt cleanup for an ENTERPRISE tier file (no ephemeral storage)', async () => {
    const { processor, removeFile, parseResume } = buildService();
    parseResume.mockResolvedValue({ raw_text: 'x', parsed_data: {} });

    await processor.process(
      buildJob({ batchId: 'batch-1', tier: 'ENTERPRISE', resumeItemId: 'item-1', storageKey: 'key-1', bucket: 'cv-files' }),
    );

    expect(removeFile).not.toHaveBeenCalled();
  });
});
