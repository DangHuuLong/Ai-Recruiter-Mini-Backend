// Service for querying audit log entries with pagination and filters, scoped to the caller's organization.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  // Called by AuditLogsController.findAll() — filters and paginates audit log entries scoped to the org.
  async findAll(query: AuditLogQueryDto, organizationId: string) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
