import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { RequestWithAnonSession } from '../middleware/anonymous-session.middleware';

export const CurrentAnonymousSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithAnonSession>();
    return request.anonSessionId;
  },
);
