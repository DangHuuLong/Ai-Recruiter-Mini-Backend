import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const ANON_SESSION_HEADER = 'x-anon-session-id';

export interface RequestWithAnonSession extends Request {
  anonSessionId: string;
}

/**
 * Applied to /public/* routes only. Public batches have no user account to
 * key data by, so every anonymous caller is identified by this session id
 * instead — echoed back on the response so the client can persist and reuse
 * it (e.g. to poll GET /public/batches/:id, or to hit the checksum cache).
 */
@Injectable()
export class AnonymousSessionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(ANON_SESSION_HEADER);
    const sessionId = incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();

    (req as RequestWithAnonSession).anonSessionId = sessionId;
    res.setHeader(ANON_SESSION_HEADER, sessionId);

    next();
  }
}
