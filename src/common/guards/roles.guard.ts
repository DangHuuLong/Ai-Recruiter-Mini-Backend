// Guards routes annotated with @Roles(), rejecting users whose role isn't in the allowed list.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppException } from '../exceptions/app.exception';
import { AuthUser } from '../types/auth-user.type';

type RequestWithUser = {
  user?: AuthUser;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  // Runs after JwtAuthGuard on routes tagged with @Roles(); blocks users whose role isn't in the allowed list.
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new AppException('Authentication required', 401);
    }

    if (!requiredRoles.includes(user.role)) {
      throw new AppException('Forbidden resource', 403);
    }

    return true;
  }
}
