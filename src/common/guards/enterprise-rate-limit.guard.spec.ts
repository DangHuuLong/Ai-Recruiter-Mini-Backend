import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EnterpriseRateLimitGuard } from './enterprise-rate-limit.guard';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../../integrations/redis/redis.service';

function buildContext(user?: { organizationId?: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
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

  const guard = new EnterpriseRateLimitGuard(redisService, configService, reflector);
  return { guard, incr, expire };
}

const RATE_LIMIT_OPTIONS = { action: 'scoring-batches', envVar: 'X', defaultMax: 20 };

describe('EnterpriseRateLimitGuard', () => {
  it('allows the request through when the route has no @RateLimit() metadata', async () => {
    const { guard, incr } = buildGuard({ reflectorValue: undefined });

    await expect(guard.canActivate(buildContext({ organizationId: 'org1' }))).resolves.toBe(true);
    expect(incr).not.toHaveBeenCalled();
  });

  it('allows the request through when there is no authenticated user on the request', async () => {
    const { guard, incr } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS });

    await expect(guard.canActivate(buildContext(undefined))).resolves.toBe(true);
    expect(incr).not.toHaveBeenCalled();
  });

  it('keys the counter by organizationId, not by user', async () => {
    const { guard, incr } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS, incrResult: 1, maxPerHour: 20 });

    await guard.canActivate(buildContext({ organizationId: 'org-42' }));
    expect(incr).toHaveBeenCalledWith('enterprise:ratelimit:scoring-batches:org-42');
  });

  it('throws a 429 AppException once the count exceeds the configured max', async () => {
    const { guard } = buildGuard({ reflectorValue: RATE_LIMIT_OPTIONS, incrResult: 21, maxPerHour: 20 });

    await expect(guard.canActivate(buildContext({ organizationId: 'org1' }))).rejects.toThrow(
      AppException,
    );
  });
});
