// Mounts the Bull Board queue dashboard behind admin-only JWT middleware.
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { NextFunction, Request, Response } from 'express';

import { verifyJwt } from '../common/utils/jwt.util';
import { PrismaService } from '../database/prisma/prisma.service';
import { QUEUE_NAMES } from './queue.constants';

const BULL_BOARD_PATH = '/api/admin/queues';

// Builds the Express middleware gating the Bull Board route to authenticated, active ADMIN users; used by setupBullBoard below.
function createAdminOnlyMiddleware(app: INestApplication) {
  const configService = app.get(ConfigService);
  const prisma = app.get(PrismaService);

  return async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.headers.authorization;
    const [type, token] = (authorization ?? '').split(' ');

    if (type !== 'Bearer' || !token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const secret = configService.getOrThrow<string>('JWT_SECRET');
    const payload = verifyJwt(token, secret);

    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
      select: { role: true, emailVerifiedAt: true },
    });

    if (!user || !user.emailVerifiedAt) {
      res.status(401).json({ success: false, message: 'User is inactive or unverified' });
      return;
    }

    if (user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Forbidden resource' });
      return;
    }

    next();
  };
}

// Called from main.ts during bootstrap to mount the /api/admin/queues dashboard onto the Nest app.
export function setupBullBoard(app: INestApplication): void {
  const queues = Object.values(QUEUE_NAMES).map((name) =>
    app.get<Queue>(getQueueToken(name)),
  );

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);

  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  app.use(BULL_BOARD_PATH, createAdminOnlyMiddleware(app), serverAdapter.getRouter());
}
