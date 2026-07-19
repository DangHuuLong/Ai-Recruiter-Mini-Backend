import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';
import { AppException } from '../exceptions/app.exception';
import { AuthUser } from '../types/auth-user.type';
import { RedisService } from '../../integrations/redis/redis.service';

const RATE_LIMIT_WINDOW_SECONDS = 3600;

type RequestWithUser = {
  user?: AuthUser;
};

// Keyed by organizationId, not userId — opt-in via @RateLimit(), unlike PublicRateLimitGuard.
@Injectable()
export class EnterpriseRateLimitGuard implements CanActivate {
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

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const organizationId = request.user?.organizationId;

    if (!organizationId) {
      return true;
    }

    const maxPerHour = this.configService.get<number>(options.envVar) ?? options.defaultMax;
    const key = `enterprise:ratelimit:${options.action}:${organizationId}`;
    const client = this.redisService.getClient();
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (count > maxPerHour) {
      throw new AppException(
        `Rate limit exceeded: max ${maxPerHour} ${options.action} per hour for this organization`,
        429,
      );
    }

    return true;
  }
}
