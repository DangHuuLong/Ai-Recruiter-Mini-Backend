// Controller for GET /audit-logs — admin-only listing of organization audit trail entries.
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  // GET /audit-logs — admin-only paginated, filtered view of the org's audit trail.
  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(@Query() query: AuditLogQueryDto, @CurrentUser() currentUser: AuthUser) {
    const result = await this.auditLogsService.findAll(query, currentUser.organizationId);

    return {
      message: 'Audit logs fetched successfully',
      data: result.data,
      meta: result.meta,
    };
  }
}
