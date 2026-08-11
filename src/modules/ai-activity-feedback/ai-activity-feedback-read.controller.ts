// REST controller for the AI Activity Feedback DEV dashboard: paginated list + detail. DEV role
// only — read-only, writing happens via AiActivityFeedbackController.
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AiActivityFeedbackQueryDto } from './dto/ai-activity-feedback-query.dto';
import { AiActivityFeedbackReadService } from './ai-activity-feedback-read.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('ai-activity-feedback')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV)
export class AiActivityFeedbackReadController {
  constructor(private readonly aiActivityFeedbackReadService: AiActivityFeedbackReadService) {}

  // GET /ai-activity-feedback — paginated listing with optional accuracy/tier/date-range filters.
  @Get()
  async findAll(@Query() query: AiActivityFeedbackQueryDto) {
    const result = await this.aiActivityFeedbackReadService.findAll(query);

    return {
      message: 'AI activity feedback fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  // GET /ai-activity-feedback/:id — full detail for one feedback record.
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const feedback = await this.aiActivityFeedbackReadService.findOne(id);

    return {
      message: 'AI activity feedback fetched successfully',
      data: feedback,
    };
  }
}
