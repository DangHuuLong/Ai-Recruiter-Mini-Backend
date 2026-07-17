import { Injectable } from '@nestjs/common';
import { AuthTokenType, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { AuthTokenService } from './auth-token.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { signJwt } from '../../common/utils/jwt.util';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findActiveByEmail(loginDto.email);

    if (!user) {
      throw new AppException('Invalid email or password', 401);
    }

    const isPasswordValid = await verifyPassword(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppException('Invalid email or password', 401);
    }

    if (!user.emailVerifiedAt) {
      throw new AppException('Email not verified. Please check your inbox.', 403);
    }

    return this.issueSession(user);
  }

  async registerOrganization(dto: RegisterOrganizationDto) {
    const email = dto.adminEmail.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new AppException('Email already exists', 409);
    }

    const slug = await this.resolveUniqueSlug(dto.slug ?? dto.organizationName);
    const passwordHash = await hashPassword(dto.adminPassword);

    const { organization, user } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
        },
      });

      const createdUser = await tx.user.create({
        data: {
          organizationId: org.id,
          email,
          passwordHash,
          fullName: dto.adminFullName,
          role: 'ADMIN',
        },
      });

      return { organization: org, user: createdUser };
    });

    await this.authTokenService.issueEmailVerificationToken(user.id, user.email, user.fullName);

    return {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      message: 'Registration successful. Please check your email to verify your account before logging in.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const userId = await this.authTokenService.consumeToken(
      dto.token,
      AuthTokenType.EMAIL_VERIFICATION,
    );

    if (!userId) {
      throw new AppException('Invalid or expired token', 400);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    return this.issueSession(user);
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.usersService.findActiveByEmail(dto.email);

    // Always respond with a generic message regardless of whether the email
    // exists or is already verified — avoids leaking account existence.
    if (user && !user.emailVerifiedAt) {
      await this.authTokenService.issueEmailVerificationToken(user.id, user.email, user.fullName);
    }

    return { message: 'If the email exists and is not yet verified, a new verification email has been sent.' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findActiveByEmail(dto.email);

    if (user) {
      await this.authTokenService.issuePasswordResetToken(user.id, user.email, user.fullName);
    }

    return { message: 'If the email exists, a password reset email has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.authTokenService.consumeToken(
      dto.token,
      AuthTokenType.PASSWORD_RESET,
    );

    if (!userId) {
      throw new AppException('Invalid or expired token', 400);
    }

    const passwordHash = await hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password reset successful. Please log in with your new password.' };
  }

  private issueSession(user: {
    id: string;
    organizationId: string;
    email: string;
    fullName: string | null;
    role: UserRole;
  }) {
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const expiresInSeconds = this.configService.get<number>('JWT_EXPIRES_IN_SECONDS') ?? 86400;

    const accessToken = signJwt(
      {
        sub: user.id,
        organizationId: user.organizationId,
        email: user.email,
        role: user.role,
      },
      secret,
      expiresInSeconds,
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  private async resolveUniqueSlug(source: string): Promise<string> {
    const base = slugify(source) || 'org';
    let candidate = base;
    let suffix = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await this.prisma.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }

      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }
}
