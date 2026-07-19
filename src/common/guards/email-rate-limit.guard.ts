import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../../integrations/redis/redis.service';

const RATE_LIMIT_WINDOW_SECONDS = 3600;

type RequestWithEmailBody = {
  body?: { email?: string };
};

// Unauthenticated auth-flow endpoints (resend-verification, forgot-password)
// have no request.user/organizationId to key on — key by the target email
// instead, so a single victim address can't be email-bombed regardless of
// how many IPs the caller rotates through. Reuses @RateLimit() metadata,
// same opt-in-per-route shape as EnterpriseRateLimitGuard/PublicRateLimitGuard.
@Injectable()
export class EmailRateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions | undefined>(RATE_LIMIT_KEY, context.getHandler());

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithEmailBody>();
    const email = request.body?.email?.trim().toLowerCase();

    if (!email) {
      return true;
    }

    const maxPerHour = this.configService.get<number>(options.envVar) ?? options.defaultMax;
    const key = `auth:ratelimit:${options.action}:${email}`;
    const client = this.redisService.getClient();
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > maxPerHour) {
      throw new AppException(
        `Rate limit exceeded: max ${maxPerHour} ${options.action} requests per hour for this email`,
        429,
      );
    }

    return true;
  }
}
