import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

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

  async send(to: string, message: { subject: string; html: string }): Promise<void> {
    const transporter = this.getTransporter();
    const from = this.configService.get<string>('email.from') ?? 'no-reply@ai-recruiter-mini.local';

    if (!transporter) {
      this.logger.warn(
        `SMTP not configured — skipping email send to ${to} (subject: ${message.subject})`,
      );
      return;
    }

    await transporter.sendMail({
      from,
      to,
      subject: message.subject,
      html: message.html,
    });
  }

  getFrontendUrl(): string {
    return this.configService.get<string>('email.frontendUrl') ?? 'http://localhost:3001';
  }
}
