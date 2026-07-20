// Marks a route handler for audit logging via AuditLogInterceptor.
import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'auditLog';

export interface AuditLogOptions {
  action: string;
  resourceType: string;
}

// Decorator applied to controller handlers; read by AuditLogInterceptor to log the action/resourceType.
export const AuditLog = (options: AuditLogOptions) => SetMetadata(AUDIT_LOG_KEY, options);
