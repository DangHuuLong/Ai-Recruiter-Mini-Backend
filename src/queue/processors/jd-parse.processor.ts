import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../queue.constants';
import { JdParseJobData } from '../jobs/job-payloads.types';
import { BatchContextStoreFactory } from '../batch-store/batch-context-store.factory';
import { AiService } from '../../integrations/ai/ai.service';

const RETRYABLE_STATUS_CODES = new Set([502, 504]);

@Processor(QUEUE_NAMES.JD_PARSE, {
  concurrency: process.env.AI_PARSE_JD_CONCURRENCY ? Number(process.env.AI_PARSE_JD_CONCURRENCY) : 8,
})
export class JdParseProcessor extends WorkerHost {
  private readonly logger = new Logger(JdParseProcessor.name);

  constructor(
    private readonly storeFactory: BatchContextStoreFactory,
    private readonly aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<JdParseJobData>): Promise<void> {
    const { batchId, tier, jdItemId, rawText } = job.data;
    const store = this.storeFactory.forTier(tier);

    try {
      const parsedData = await this.aiService.parseJobDescription(rawText);

      await store.updateJdItem(batchId, jdItemId, { status: 'SUCCESS', parsedData });
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 500;

      if (RETRYABLE_STATUS_CODES.has(statusCode)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Job description parsing failed';
      this.logger.warn(`JD item ${jdItemId} (batch ${batchId}) failed to parse: ${message}`);
      await store.updateJdItem(batchId, jdItemId, { status: 'FAILED', parsingError: message });
    }
  }
}
