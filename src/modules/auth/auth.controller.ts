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

  @Post('register-organization')
  async registerOrganization(@Body() dto: RegisterOrganizationDto) {
    const result = await this.authService.registerOrganization(dto);

    return {
      message: result.message,
      data: { organizationId: result.organizationId, organizationSlug: result.organizationSlug },
    };
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    const result = await this.authService.login(loginDto);

    return {
      message: 'Login successful',
      data: result,
    };
  }

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
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);

    return { message: result.message, data: null };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);

    return { message: result.message, data: null };
  }
}
