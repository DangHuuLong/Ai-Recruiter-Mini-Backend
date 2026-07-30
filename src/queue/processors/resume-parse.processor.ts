// BullMQ processor: parses one resume file/text via the AI service, with checksum-based caching.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queue.constants';
import { ResumeParseJobData } from '../jobs/job-payloads.types';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { AiService } from '../../integrations/ai/ai.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

const RESUME_SIGNED_URL_EXPIRES_IN_SECONDS = 300;
const RETRYABLE_STATUS_CODES = new Set([502, 504]);

@Processor(QUEUE_NAMES.RESUME_PARSE, {
  concurrency: process.env.AI_PARSE_RESUME_CONCURRENCY
    ? Number(process.env.AI_PARSE_RESUME_CONCURRENCY)
    : 8,
})
export class ResumeParseProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeParseProcessor.name);

  constructor(
    private readonly storeFactory: BatchContextStoreFactory,
    private readonly aiService: AiService,
    private readonly storageService: SupabaseStorageService,
  ) {
    super();
  }

  // BullMQ handler for the resume-parse queue, enqueued by scoring-batches/public-batches services; feeds BatchProgressCoordinatorService's completion tracking via store.updateResumeItem.
  async process(job: Job<ResumeParseJobData>): Promise<void> {
    const { batchId, tier, resumeItemId, storageKey, bucket, fileName, fileType, checksum, rawText } =
      job.data;
    const store = this.storeFactory.forTier(tier);
    const isFileBased = Boolean(storageKey);

    if ((await store.getBatchStatusOnly(batchId)) === 'CANCELLED') {
      return;
    }

    try {
      if (isFileBased && checksum) {
        const cached = await store.findCachedParsedResumeByChecksum(
          { organizationId: job.data.organizationId, sessionId: job.data.sessionId },
          checksum,
        );

        if (cached) {
          await store.updateResumeItem(batchId, resumeItemId, {
            status: 'SUCCESS',
            parsedData: cached,
          });
          return;
        }
      }

      const parseResult = isFileBased
        ? await this.aiService.parseResume({
            resume_id: resumeItemId,
            file_name: fileName,
            file_type: fileType,
            signed_url: await this.storageService.createSignedUrl(
              storageKey!,
              RESUME_SIGNED_URL_EXPIRES_IN_SECONDS,
              bucket,
            ),
            checksum,
          })
        : await this.aiService.parseResume({ resume_id: resumeItemId, raw_text: rawText });

      await store.updateResumeItem(batchId, resumeItemId, {
        status: 'SUCCESS',
        rawText: parseResult.raw_text,
        parsedData: parseResult.parsed_data,
      });
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;

      if (RETRYABLE_STATUS_CODES.has(statusCode)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Resume parsing failed';
      this.logger.warn(`Resume item ${resumeItemId} (batch ${batchId}) failed to parse: ${message}`);
      await store.updateResumeItem(batchId, resumeItemId, { status: 'FAILED', parsingError: message });
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
