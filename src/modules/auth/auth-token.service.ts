import { Injectable } from '@nestjs/common';
import { AuthTokenType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { generateRawToken, hashToken } from '../../common/utils/token.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmailService } from '../../integrations/email/email.service';
import {
  passwordResetTemplate,
  verifyEmailTemplate,
} from '../../integrations/email/email.templates';

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async issueEmailVerificationToken(
    userId: string,
    email: string,
    fullName: string | null,
  ): Promise<void> {
    const ttlSeconds =
      this.configService.get<number>('EMAIL_VERIFICATION_TOKEN_TTL_SECONDS') ?? 86400;
    const rawToken = await this.createToken(userId, AuthTokenType.EMAIL_VERIFICATION, ttlSeconds);

    const verifyUrl = `${this.emailService.getFrontendUrl()}/verify-email?token=${rawToken}`;
    const message = verifyEmailTemplate({ fullName, verifyUrl });
    await this.emailService.send(email, message);
  }

  async issuePasswordResetToken(
    userId: string,
    email: string,
    fullName: string | null,
  ): Promise<void> {
    const ttlSeconds = this.configService.get<number>('PASSWORD_RESET_TOKEN_TTL_SECONDS') ?? 3600;
    const rawToken = await this.createToken(userId, AuthTokenType.PASSWORD_RESET, ttlSeconds);

    const resetUrl = `${this.emailService.getFrontendUrl()}/reset-password?token=${rawToken}`;
    const message = passwordResetTemplate({ fullName, resetUrl });
    await this.emailService.send(email, message);
  }

  /** Validates and consumes a token, returning the associated userId or null if invalid/expired/used. */
  async consumeToken(rawToken: string, type: AuthTokenType): Promise<string | null> {
    const tokenHash = hashToken(rawToken);

    const token = await this.prisma.authToken.findUnique({
      where: { tokenHash },
    });

    if (!token || token.type !== type || token.usedAt || token.expiresAt < new Date()) {
      return null;
    }

    await this.prisma.authToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    return token.userId;
  }

  private async createToken(
    userId: string,
    type: AuthTokenType,
    ttlSeconds: number,
  ): Promise<string> {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    await this.prisma.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.authToken.create({
      data: {
        userId,
        type,
        tokenHash,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });

    return rawToken;
  }
}
