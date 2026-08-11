// REST controller for submitting AI activity feedback — one JWT-protected route for the
// enterprise flow, one anonymous+rate-limited route for the public flow. Guard stacks differ
// per method, so no class-level @UseGuards.
import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { CreateEvaluationFeedbackDto } from './dto/create-evaluation-feedback.dto';
import { CreatePublicFeedbackDto } from './dto/create-public-feedback.dto';
import { AiActivityFeedbackService } from './ai-activity-feedback.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller()
export class AiActivityFeedbackController {
  constructor(private readonly aiActivityFeedbackService: AiActivityFeedbackService) {}

  // POST /evaluations/:id/feedback — feedback on a real, persisted evaluation result.
  @Post('evaluations/:id/feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.HIRING_MANAGER)
  async submitEvaluationFeedback(
    @Param('id') id: string,
    @Body() dto: CreateEvaluationFeedbackDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    const feedback = await this.aiActivityFeedbackService.submitEvaluationFeedback(
      id,
      currentUser.organizationId,
      dto,
    );

    return {
      message: 'Feedback submitted successfully',
      data: feedback,
    };
  }

  // POST /public/feedback — feedback on one scored cell of an anonymous batch, identified by
  // batchId+resumeItemId+jdItemId since public batches never persist an evaluation row.
  @Post('public/feedback')
  @UseGuards(PublicRateLimitGuard)
  @HttpCode(201)
  async submitPublicFeedback(@Body() dto: CreatePublicFeedbackDto) {
    const feedback = await this.aiActivityFeedbackService.submitPublicFeedback(dto);

    return {
      message: 'Feedback submitted successfully',
      data: feedback,
    };
  }
}
