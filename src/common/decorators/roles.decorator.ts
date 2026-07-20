// Marks a route handler as requiring one of the given UserRole values, checked by RolesGuard.
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
// Decorator applied to handlers to declare allowed roles; enforced by RolesGuard on each request.
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
