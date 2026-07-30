// Controller for /auth — registration, login, email verification, and password reset flows.
import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { EmailRateLimitGuard } from '../../common/guards/email-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /auth/register-organization — creates a new organization and its first admin user, then sends a verification email.
  @Post('register-organization')
  async registerOrganization(@Body() dto: RegisterOrganizationDto) {
    const result = await this.authService.registerOrganization(dto);

    return {
      message: result.message,
      data: { organizationId: result.organizationId, organizationSlug: result.organizationSlug },
    };
  }

  // POST /auth/login — verifies credentials and issues a JWT session.
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);

    return {
      message: 'Login successful',
      data: result,
    };
  }

  // POST /auth/verify-email — consumes the verification token and logs the user in.
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.authService.verifyEmail(dto);

    return {
      message: 'Email verified successfully',
      data: result,
    };
  }

  @Post('resend-verification')
  @UseGuards(EmailRateLimitGuard)
  @RateLimit({
    action: 'resend-verification',
    envVar: 'AUTH_RATE_LIMIT_MAX_RESEND_VERIFICATION_PER_HOUR',
    defaultMax: 3,
  })
  // POST /auth/resend-verification — rate-limited resend of the email verification link.
  async resendVerification(@Body() dto: ResendVerificationDto) {
    const result = await this.authService.resendVerification(dto);

    return { message: result.message, data: null };
  }

  @Post('forgot-password')
  @UseGuards(EmailRateLimitGuard)
  @RateLimit({
    action: 'forgot-password',
    envVar: 'AUTH_RATE_LIMIT_MAX_FORGOT_PASSWORD_PER_HOUR',
    defaultMax: 3,
  })
  // POST /auth/forgot-password — rate-limited trigger of a password reset email.
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);

    return { message: result.message, data: null };
  }

  // POST /auth/reset-password — consumes the reset token and sets a new password.
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);

    return { message: result.message, data: null };
  }
}
