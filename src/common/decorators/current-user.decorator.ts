// Extracts the authenticated user (set by JwtAuthGuard) from the request.
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthUser } from '../types/auth-user.type';

type RequestWithUser = {
  user?: AuthUser;
};

// Param decorator used across controllers to inject the AuthUser attached by JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
