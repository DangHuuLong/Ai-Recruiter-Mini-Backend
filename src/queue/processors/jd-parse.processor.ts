import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queue.constants';
import { JdParseJobData } from '../jobs/job-payloads.types';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { AiService } from '../../integrations/ai/ai.service';
import { JobDescriptionClassifierService } from '../../modules/job-descriptions/job-description-classifier.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

const JD_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const RETRYABLE_STATUS_CODES = new Set([502, 504]);

@Processor(QUEUE_NAMES.JD_PARSE, {
  concurrency: process.env.AI_PARSE_JD_CONCURRENCY ? Number(process.env.AI_PARSE_JD_CONCURRENCY) : 8,
})
export class JdParseProcessor extends WorkerHost {
  private readonly logger = new Logger(JdParseProcessor.name);

  constructor(
    private readonly storeFactory: BatchContextStoreFactory,
    private readonly aiService: AiService,
    private readonly storageService: SupabaseStorageService,
    private readonly classifierService: JobDescriptionClassifierService,
  ) {
    super();
  }

  async process(job: Job<JdParseJobData>): Promise<void> {
    const { batchId, tier, jdItemId, rawText, storageKey, bucket, fileName, fileType } = job.data;
    const store = this.storeFactory.forTier(tier);
    const isFileBased = Boolean(storageKey);

    if ((await store.getBatchStatusOnly(batchId)) === 'CANCELLED') {
      return;
    }

    try {
      const parsedData = isFileBased
        ? await this.aiService.parseJobDescription({
            file_name: fileName,
            file_type: fileType,
            signed_url: await this.storageService.createSignedUrl(
              storageKey!,
              JD_SIGNED_URL_EXPIRES_IN_SECONDS,
              bucket,
            ),
          })
        : await this.aiService.parseJobDescription({ raw_text: rawText });
      const classification = await this.classifierService.classify(parsedData);

      await store.updateJdItem(batchId, jdItemId, {
        status: 'SUCCESS',
        parsedData,
        occupationFamily: classification?.occupationFamily ?? null,
        specialization: classification?.specialization ?? null,
      });
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;

      if (RETRYABLE_STATUS_CODES.has(statusCode)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Job description parsing failed';
      this.logger.warn(`JD item ${jdItemId} (batch ${batchId}) failed to parse: ${message}`);
      await store.updateJdItem(batchId, jdItemId, { status: 'FAILED', parsingError: message });
    } finally {
      if (isFileBased && tier === 'PUBLIC') {
        try {
          await this.storageService.removeFile(storageKey!, bucket);
        } catch (cleanupError) {
          this.logger.warn(`Failed to delete public temp file ${storageKey}`, cleanupError as Error);
        }
      }
    }
  }
}
