// Extracts the anonymous session id (set by AnonymousSessionMiddleware) from the request.
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { RequestWithAnonSession } from '../middleware/anonymous-session.middleware';

// Param decorator used in controller handlers to inject the anon session id set by AnonymousSessionMiddleware.
export const CurrentAnonymousSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithAnonSession>();
    return request.anonSessionId;
  },
);
