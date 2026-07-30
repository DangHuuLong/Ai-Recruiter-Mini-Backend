// Sends email via SMTP (nodemailer); no-ops silently when SMTP env vars aren't configured.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  // Lazily builds and caches the nodemailer transporter from SMTP config; returns null when SMTP isn't configured, used by send().
  private getTransporter(): Transporter | null {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>('email.smtpHost');
    const port = this.configService.get<number>('email.smtpPort');
    const user = this.configService.get<string>('email.smtpUser');
    const password = this.configService.get<string>('email.smtpPassword');

    if (!host || !port) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && password ? { user, pass: password } : undefined,
    });

    return this.transporter;
  }

  // Sends a transactional email (verification/reset/batch-completed) via the SMTP transporter; called from auth and notify.processor.ts flows.
  async send(to: string, message: { subject: string; html: string }): Promise<void> {
    const transporter = this.getTransporter();
    const from = this.configService.get<string>('email.from') ?? 'no-reply@ai-recruiter-mini.local';

    if (!transporter) {
      this.logger.warn(
        `SMTP not configured — skipping email send to ${to} (subject: ${message.subject})`,
      );
      return;
    }

    try {
      await transporter.sendMail({
        from,
        to,
        subject: message.subject,
        html: message.html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${to} (subject: ${message.subject}): ${reason}`);
    }
  }

  // Returns the frontend base URL used by callers to build verification/reset links embedded in emails.
  getFrontendUrl(): string {
    return this.configService.get<string>('email.frontendUrl') ?? 'http://localhost:3001';
  }
}
