import { describe, expect, it, jest } from '@jest/globals';

import { AiActivityLogService } from './ai-activity-log.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const findMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const count = jest.fn<(...args: unknown[]) => Promise<number>>();
  const findUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const aggregate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const queryRaw = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]);

  const prisma = {
    aiActivityLog: { findMany, count, findUnique, aggregate },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  return { prisma, findMany, count, findUnique, aggregate, queryRaw };
}

describe('AiActivityLogService.findOne', () => {
  it('throws 404 when the log does not exist', async () => {
    const { prisma, findUnique } = buildPrismaMock();
    findUnique.mockResolvedValue(null);
    const service = new AiActivityLogService(prisma);

    await expect(service.findOne('missing')).rejects.toThrow(AppException);
  });

  it('returns the full row (including input/output) when it exists', async () => {
    const { prisma, findUnique } = buildPrismaMock();
    const log = { id: 'log-1', input: { a: 1 }, output: { b: 2 } };
    findUnique.mockResolvedValue(log);
    const service = new AiActivityLogService(prisma);

    await expect(service.findOne('log-1')).resolves.toEqual(log);
  });
});

describe('AiActivityLogService.getSummary', () => {
  it('reports null successRate/avgLatencyMs when there is no data at all', async () => {
    const { prisma, count, aggregate } = buildPrismaMock();
    count.mockResolvedValue(0);
    aggregate.mockResolvedValue({ _avg: { latencyMs: null } });
    const service = new AiActivityLogService(prisma);

    const result = await service.getSummary();

    expect(result).toEqual({
      totalToday: 0,
      totalThisMonth: 0,
      successRate: null,
      avgLatencyMs: null,
    });
  });

  it('computes successRate as a percentage rounded to 1 decimal, and rounds avgLatencyMs', async () => {
    const { prisma, count, aggregate } = buildPrismaMock();
    count
      .mockResolvedValueOnce(5) // totalToday
      .mockResolvedValueOnce(20) // totalThisMonth
      .mockResolvedValueOnce(30) // totalAll
      .mockResolvedValueOnce(29); // successAll
    aggregate.mockResolvedValue({ _avg: { latencyMs: 842.7 } });
    const service = new AiActivityLogService(prisma);

    const result = await service.getSummary();

    expect(result).toEqual({
      totalToday: 5,
      totalThisMonth: 20,
      successRate: 96.7,
      avgLatencyMs: 843,
    });
  });
});

describe('AiActivityLogService.getTimeseries', () => {
  it('zero-fills every day of the requested month when there are no matching logs', async () => {
    const { prisma, queryRaw } = buildPrismaMock();
    queryRaw.mockResolvedValue([]);
    const service = new AiActivityLogService(prisma);

    const result = await service.getTimeseries({ granularity: 'day', date: '2026-03', tzOffsetMinutes: 0 });

    expect(result).toHaveLength(31); // March has 31 days
    expect(result[0]).toEqual({ bucket: '01', PARSE_RESUME: 0, PARSE_JOB_DESCRIPTION: 0, SCORE_APPLICATION: 0 });
    expect(result[30]).toEqual({ bucket: '31', PARSE_RESUME: 0, PARSE_JOB_DESCRIPTION: 0, SCORE_APPLICATION: 0 });
  });

  it('places a returned row into its matching day bucket by functionType', async () => {
    const { prisma, queryRaw } = buildPrismaMock();
    queryRaw.mockResolvedValue([
      { bucket: new Date('2026-03-05T00:00:00Z'), functionType: 'SCORE_APPLICATION', count: 7n },
    ]);
    const service = new AiActivityLogService(prisma);

    const result = await service.getTimeseries({ granularity: 'day', date: '2026-03', tzOffsetMinutes: 0 });

    const day5 = result.find((bucket) => bucket.bucket === '05');
    expect(day5).toEqual({ bucket: '05', PARSE_RESUME: 0, PARSE_JOB_DESCRIPTION: 0, SCORE_APPLICATION: 7 });
  });

  it('produces 24 hour buckets for hour granularity and 12 month buckets for month granularity', async () => {
    const { prisma, queryRaw } = buildPrismaMock();
    queryRaw.mockResolvedValue([]);
    const service = new AiActivityLogService(prisma);

    const hourly = await service.getTimeseries({ granularity: 'hour', date: '2026-03-05', tzOffsetMinutes: 0 });
    const monthly = await service.getTimeseries({ granularity: 'month', date: '2026', tzOffsetMinutes: 0 });

    expect(hourly).toHaveLength(24);
    expect(monthly).toHaveLength(12);
  });
});
