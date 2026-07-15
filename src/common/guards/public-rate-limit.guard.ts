import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RequestWithAnonSession } from '../middleware/anonymous-session.middleware';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../../integrations/redis/redis.service';

const RATE_LIMIT_WINDOW_SECONDS = 3600;

/**
 * Limits how many batches a single anonymous caller can create per hour.
 * Keyed by IP *and* session id together — IP alone is too coarse (shared
 * NAT/office proxies), session id alone is trivially reset by clearing
 * client storage, but requiring both raises the bar without needing auth.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAnonSession>();
    const maxPerHour =
      this.configService.get<number>('PUBLIC_RATE_LIMIT_MAX_BATCHES_PER_HOUR') ?? 5;

    const key = `public:ratelimit:${request.ip}:${request.anonSessionId}`;
    const client = this.redisService.getClient();
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > maxPerHour) {
      throw new AppException(
        `Rate limit exceeded: max ${maxPerHour} batches per hour for anonymous users`,
        429,
      );
    }

    return true;
  }
}
