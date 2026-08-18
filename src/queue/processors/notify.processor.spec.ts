import { describe, expect, it, jest } from '@jest/globals';
import type { HttpService } from '@nestjs/axios';
import type { Job } from 'bullmq';
import { of, throwError } from 'rxjs';

import { NotifyProcessor } from './notify.processor';
import { EmailService } from '../../integrations/email/email.service';

function buildService() {
  const post = jest.fn();
  const httpService = { post } as unknown as HttpService;

  const send = jest.fn<(...args: unknown[]) => Promise<void>>();
  const emailService = { send } as unknown as EmailService;

  const processor = new NotifyProcessor(httpService, emailService);

  return { processor, post, send };
}

function buildJob(data: Record<string, unknown>): Job<never> {
  return { data } as unknown as Job<never>;
}

describe('NotifyProcessor.process', () => {
  it('posts to the webhook when a webhookUrl is given', async () => {
    const { processor, post } = buildService();
    post.mockReturnValue(of({ data: {} }));

    await processor.process(buildJob({ batchId: 'batch-1', status: 'COMPLETED', webhookUrl: 'https://example.com/hook' }));

    expect(post).toHaveBeenCalledWith(
      'https://example.com/hook',
      { batchId: 'batch-1', status: 'COMPLETED' },
      expect.objectContaining({ timeout: 10_000 }),
    );
  });

  it('does not call the webhook when webhookUrl is absent', async () => {
    const { processor, post } = buildService();

    await processor.process(buildJob({ batchId: 'batch-1', status: 'COMPLETED' }));

    expect(post).not.toHaveBeenCalled();
  });

  it('swallows a webhook failure instead of throwing, so the job still resolves', async () => {
    const { processor, post } = buildService();
    post.mockReturnValue(throwError(() => new Error('webhook endpoint down')));

    await expect(
      processor.process(buildJob({ batchId: 'batch-1', status: 'COMPLETED', webhookUrl: 'https://example.com/hook' })),
    ).resolves.toBeUndefined();
  });

  it('sends an email when an email address is given', async () => {
    const { processor, send } = buildService();

    await processor.process(buildJob({ batchId: 'batch-1', status: 'COMPLETED', email: 'recruiter@example.com' }));

    expect(send).toHaveBeenCalledWith('recruiter@example.com', expect.any(Object));
  });

  it('does not send an email when no email address is given', async () => {
    const { processor, send } = buildService();

    await processor.process(buildJob({ batchId: 'batch-1', status: 'COMPLETED' }));

    expect(send).not.toHaveBeenCalled();
  });

  it('still sends the email even when the webhook call failed', async () => {
    const { processor, post, send } = buildService();
    post.mockReturnValue(throwError(() => new Error('webhook endpoint down')));

    await processor.process(
      buildJob({
        batchId: 'batch-1',
        status: 'COMPLETED',
        webhookUrl: 'https://example.com/hook',
        email: 'recruiter@example.com',
      }),
    );

    expect(send).toHaveBeenCalledWith('recruiter@example.com', expect.any(Object));
  });
});
