import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AUDIT_LOG_KEY, AuditLogOptions } from '../decorators/audit-log.decorator';
import { AuthUser } from '../types/auth-user.type';
import { PrismaService } from '../../database/prisma/prisma.service';

type RequestWithAuditContext = {
  user?: AuthUser;
  params: Record<string, string>;
  body?: unknown;
};

// Opt-in per route via @AuditLog() — sees the raw {message, data} return value,
// since TransformResponseInterceptor (which wraps it) is registered globally.
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditLogOptions | undefined>(AUDIT_LOG_KEY, context.getHandler());

    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithAuditContext>();

    return next.handle().pipe(
      tap((result: unknown) => {
        void this.writeLog(options, request, result);
      }),
    );
  }

  private async writeLog(options: AuditLogOptions, request: RequestWithAuditContext, result: unknown) {
    if (!request.user) {
      return;
    }

    const data = (result as { data?: { id?: string } } | undefined)?.data;
    const resourceId = request.params.id ?? data?.id;
    const hasBody = request.body && Object.keys(request.body).length > 0;

    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: request.user.organizationId,
          actorUserId: request.user.id,
          action: options.action,
          resourceType: options.resourceType,
          resourceId,
          metadata: hasBody ? (request.body as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to write audit log for ${options.resourceType}/${resourceId}`, error);
    }
  }
}
