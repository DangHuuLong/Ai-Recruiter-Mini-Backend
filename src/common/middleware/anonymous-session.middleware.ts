// Identifies anonymous callers in place of a user account; echoed back so
// the client can reuse it for polling and checksum caching.
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const ANON_SESSION_HEADER = 'x-anon-session-id';

export interface RequestWithAnonSession extends Request {
  anonSessionId: string;
}

@Injectable()
export class AnonymousSessionMiddleware implements NestMiddleware {
  // Registered globally in main.ts/app.module.ts; stamps anonSessionId onto the request for PublicRateLimitGuard and CurrentAnonymousSession.
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(ANON_SESSION_HEADER);
    const sessionId = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

    (req as RequestWithAnonSession).anonSessionId = sessionId;
    res.setHeader(ANON_SESSION_HEADER, sessionId);

    next();
  }
}
