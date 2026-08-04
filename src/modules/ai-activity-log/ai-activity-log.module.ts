// Nest module wiring for the AI Activity Log feature — read API (controller/service) for the DEV dashboard, plus the write-side logger consumed by AiService.
import { Module } from '@nestjs/common';

import { AiActivityLogController } from './ai-activity-log.controller';
import { AiActivityLoggerService } from './ai-activity-log-logger.service';
import { AiActivityLogService } from './ai-activity-log.service';

@Module({
  controllers: [AiActivityLogController],
  providers: [AiActivityLogService, AiActivityLoggerService],
  exports: [AiActivityLoggerService],
})
export class AiActivityLogModule {}
