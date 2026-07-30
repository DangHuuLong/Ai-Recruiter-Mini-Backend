import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EmailRateLimitGuard } from './email-rate-limit.guard';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../../integrations/redis/redis.service';

function buildContext(body?: { email?: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
  } as unknown as ExecutionContext;
}

function buildGuard(overrides: { reflectorValue?: unknown; incrResult?: number; maxPerHour?: number }) {
  const incr = jest.fn<(key: string) => Promise<number>>().mockResolvedValue(overrides.incrResult ?? 1);
  const expire = jest.fn<(key: string, seconds: number) => Promise<number>>().mockResolvedValue(1);
  const redisService = { getClient: () => ({ incr, expire }) } as unknown as RedisService;
  const configService = {
    get: jest.fn().mockReturnValue(overrides.maxPerHour),
  } as unknown as ConfigService;
  const reflector = {
    get: jest.fn().mockReturnValue(overrides.reflectorValue),
  } as unknown as Reflector;

  const guard = new EmailRateLimitGuard(redisService, configService, reflector);
  return { guard, incr, expire };
}

const RATE_LIMIT_OPTIONS = { action: 'resend-verification', envVar: 'X', defaultMax: 3 };

describe('EmailRateLimitGuard', () => {
  it('allows the request through when the route has no @RateLimit() metadata', async () => {
    const { guard, incr } = buildGuard({ reflectorValue: undefined });

    await expect(guard.canActivate(buildContext({ email: 'a@b.com' }))).resolves.toBe(true);
    expect(incr).not.toHaveBeenCalled();
  });

  it('allows the request through when there is no email in the body', async () => {
    const { guard, incr } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS });

    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
    expect(incr).not.toHaveBeenCalled();
  });

  it('increments the counter and sets expiry on the first call for an email', async () => {
    const { guard, incr, expire } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS, incrResult: 1, maxPerHour: 3 });

    await expect(guard.canActivate(buildContext({ email: 'A@B.com' }))).resolves.toBe(true);
    expect(incr).toHaveBeenCalledWith('auth:ratelimit:resend-verification:a@b.com');
    expect(expire).toHaveBeenCalledWith('auth:ratelimit:resend-verification:a@b.com', 3600);
  });

  it('does not reset expiry on subsequent calls within the window', async () => {
    const { guard, expire } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS, incrResult: 2, maxPerHour: 3 });

    await expect(guard.canActivate(buildContext({ email: 'a@b.com' }))).resolves.toBe(true);
    expect(expire).not.toHaveBeenCalled();
  });

  it('throws a 429 AppException once the count exceeds the configured max', async () => {
    const { guard } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS, incrResult: 4, maxPerHour: 3 });

    await expect(guard.canActivate(buildContext({ email: 'a@b.com' }))).rejects.toThrow(AppException);
  });
});
