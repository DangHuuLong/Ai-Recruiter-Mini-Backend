// Nest module wiring for the AI Activity Feedback feature — write endpoints (enterprise +
// public) and the DEV-only read dashboard.
import { Module } from '@nestjs/common';

import { AiActivityFeedbackReadController } from './ai-activity-feedback-read.controller';
import { AiActivityFeedbackReadService } from './ai-activity-feedback-read.service';
import { AiActivityFeedbackController } from './ai-activity-feedback.controller';
import { AiActivityFeedbackService } from './ai-activity-feedback.service';

@Module({
  controllers: [AiActivityFeedbackController, AiActivityFeedbackReadController],
  providers: [AiActivityFeedbackService, AiActivityFeedbackReadService],
})
export class AiActivityFeedbackModule {}
