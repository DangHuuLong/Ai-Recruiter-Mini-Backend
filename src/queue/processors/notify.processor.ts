// BullMQ processor: sends batch-completed notifications via webhook and/or email.
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

import { QUEUE_NAMES } from '../queue.constants';
import { NotifyJobData } from '../jobs/job-payloads.types';
import { EmailService } from '../../integrations/email/email.service';
import { batchCompletedTemplate } from '../../integrations/email/email.templates';

@Processor(QUEUE_NAMES.NOTIFY)
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyProcessor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  // BullMQ handler for the notify queue, enqueued by BatchProgressCoordinatorService.enqueueNotifyIfConfigured when a batch finishes.
  async process(job: Job<NotifyJobData>): Promise<void> {
    const { batchId, status, webhookUrl, email } = job.data;

    if (webhookUrl) {
      try {
        await firstValueFrom(
          this.httpService.post(webhookUrl, { batchId, status }, { timeout: 10_000 }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Webhook notification failed for batch ${batchId}: ${message}`);
      }
    }

    if (email) {
      const message = batchCompletedTemplate({ batchId, status });
      await this.emailService.send(email, message);
    }
  }
}
