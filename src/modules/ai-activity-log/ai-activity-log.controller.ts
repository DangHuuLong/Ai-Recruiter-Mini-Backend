// REST controller for the AI Activity Log DEV dashboard: paginated list, detail, and chart stats. DEV role only — read-only, no create/update routes (writing happens via AiActivityLoggerService).
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AiActivityLogQueryDto } from './dto/ai-activity-log-query.dto';
import { AiActivityLogTimeseriesQueryDto } from './dto/ai-activity-log-timeseries-query.dto';
import { AiActivityLogService } from './ai-activity-log.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('ai-activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV)
export class AiActivityLogController {
  constructor(private readonly aiActivityLogService: AiActivityLogService) {}

  // GET /ai-activity-logs/stats/summary — KPI row (today/this-month counts, success rate, avg latency).
  @Get('stats/summary')
  async getSummary() {
    const summary = await this.aiActivityLogService.getSummary();

    return {
      message: 'AI activity summary fetched successfully',
      data: summary,
    };
  }

  // GET /ai-activity-logs/stats/timeseries?granularity=hour|day|month&date=... — bucketed counts per functionType for the charts.
  @Get('stats/timeseries')
  async getTimeseries(@Query() query: AiActivityLogTimeseriesQueryDto) {
    const timeseries = await this.aiActivityLogService.getTimeseries(query);

    return {
      message: 'AI activity timeseries fetched successfully',
      data: timeseries,
    };
  }

  // GET /ai-activity-logs — paginated listing with optional functionType/tier/status/organizationId/date-range filters.
  @Get()
  async findAll(@Query() query: AiActivityLogQueryDto) {
    const result = await this.aiActivityLogService.findAll(query);

    return {
      message: 'AI activity logs fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }

  // GET /ai-activity-logs/:id — full detail (input/output/error/latency) for the drawer view.
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const log = await this.aiActivityLogService.findOne(id);

    return {
      message: 'AI activity log fetched successfully',
      data: log,
    };
  }
}
