// Read-side service for the AI Activity Log DEV dashboard: paginated list, single-log detail,
// and time-bucketed/summary stats for the charts. Writing happens exclusively through
// AiActivityLoggerService (called from AiService) — this service never creates rows.
import { Injectable } from '@nestjs/common';
import { AiFunctionType, Prisma } from '@prisma/client';

import { AiActivityLogQueryDto } from './dto/ai-activity-log-query.dto';
import { AiActivityLogTimeseriesQueryDto } from './dto/ai-activity-log-timeseries-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

const FUNCTION_TYPES: AiFunctionType[] = [
  'PARSE_RESUME',
  'PARSE_JOB_DESCRIPTION',
  'SCORE_APPLICATION',
];

interface TimeseriesRow {
  bucket: Date;
  functionType: AiFunctionType;
  count: bigint;
}

@Injectable()
export class AiActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  // Called by AiActivityLogController.findAll — list view intentionally omits input/output to stay light.
  async findAll(query: AiActivityLogQueryDto) {
    const where: Prisma.AiActivityLogWhereInput = {
      functionType: query.functionType,
      tier: query.tier,
      status: query.status,
      organizationId: query.organizationId,
      batchId: query.batchId,
      resumeId: query.resumeId,
      jobDescriptionId: query.jobDescriptionId,
      createdAt:
        query.from || query.to
          ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
          : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.aiActivityLog.findMany({
        where,
        select: {
          id: true,
          functionType: true,
          tier: true,
          status: true,
          organizationId: true,
          batchId: true,
          evaluationId: true,
          resumeId: true,
          jobDescriptionId: true,
          errorMessage: true,
          latencyMs: true,
          createdAt: true,
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiActivityLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  // Called by AiActivityLogController.findOne — full row including input/output for the detail drawer.
  async findOne(id: string) {
    const log = await this.prisma.aiActivityLog.findUnique({ where: { id } });

    if (!log) {
      throw new AppException(`AI activity log ${id} not found`, 404);
    }

    return log;
  }

  // Called by AiActivityLogController.getSummary — KPI row (today/this-month counts, success rate, avg latency).
  // tzOffsetMinutes shifts "today"/"this month" boundaries to the caller's local calendar — see
  // getTimeseries's doc comment for why a fixed offset instead of a full IANA timezone is enough here.
  async getSummary(tzOffsetMinutes = 0) {
    const localNow = this.toLocal(new Date(), tzOffsetMinutes);
    const localStartOfToday = new Date(
      Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()),
    );
    const localStartOfMonth = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1));
    const startOfToday = this.toUtcInstant(localStartOfToday, tzOffsetMinutes);
    const startOfMonth = this.toUtcInstant(localStartOfMonth, tzOffsetMinutes);

    const [totalToday, totalThisMonth, totalAll, successAll, latencyAgg] = await Promise.all([
      this.prisma.aiActivityLog.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.aiActivityLog.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.aiActivityLog.count(),
      this.prisma.aiActivityLog.count({ where: { status: 'SUCCESS' } }),
      this.prisma.aiActivityLog.aggregate({ _avg: { latencyMs: true } }),
    ]);

    return {
      totalToday,
      totalThisMonth,
      successRate: totalAll === 0 ? null : Math.round((successAll / totalAll) * 1000) / 10,
      avgLatencyMs: latencyAgg._avg.latencyMs === null ? null : Math.round(latencyAgg._avg.latencyMs),
    };
  }

  // Called by AiActivityLogController.getTimeseries — bucketed call counts per functionType, zero-filled
  // for empty buckets, all in the caller's local calendar (see tzOffsetMinutes doc on the DTO).
  //
  // createdAt is stored as a naive `timestamp` written from a UTC instant (no zone attached), so
  // "local" bucketing means shifting it by the offset *before* truncating — both in the WHERE range
  // (computed in JS below) and inside the SQL date_trunc itself (bucket boundaries must move too,
  // not just the overall window) — then reading the shifted result's UTC getters gives the correct
  // local calendar value, since the shift already did the timezone conversion.
  async getTimeseries(query: AiActivityLogTimeseriesQueryDto) {
    const { start, end, buckets, truncUnit } = this.resolveRange(
      query.granularity,
      query.tzOffsetMinutes,
      query.date,
    );

    const rows = await this.prisma.$queryRaw<TimeseriesRow[]>`
      SELECT
        date_trunc(${truncUnit}, "createdAt" + make_interval(mins => ${query.tzOffsetMinutes})) AS bucket,
        "functionType",
        COUNT(*)::bigint AS count
      FROM "AiActivityLog"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY bucket, "functionType"
    `;

    const countsByBucket = new Map<string, Record<AiFunctionType, number>>();
    for (const bucketLabel of buckets) {
      countsByBucket.set(bucketLabel.key, { PARSE_RESUME: 0, PARSE_JOB_DESCRIPTION: 0, SCORE_APPLICATION: 0 });
    }

    for (const row of rows) {
      const key = this.bucketKey(query.granularity, row.bucket);
      const entry = countsByBucket.get(key);
      if (entry) {
        entry[row.functionType] = Number(row.count);
      }
    }

    return buckets.map((bucketLabel) => ({
      bucket: bucketLabel.label,
      ...(countsByBucket.get(bucketLabel.key) ?? {
        PARSE_RESUME: 0,
        PARSE_JOB_DESCRIPTION: 0,
        SCORE_APPLICATION: 0,
      }),
    }));
  }

  // Shifts a UTC instant forward by the offset so its UTC getters read as local wall-clock values.
  private toLocal(utcDate: Date, tzOffsetMinutes: number): Date {
    return new Date(utcDate.getTime() + tzOffsetMinutes * 60_000);
  }

  // Inverse of toLocal — converts a "local calendar" instant (built via Date.UTC from local
  // components) back to the real UTC instant to compare against the naive-UTC-stored column.
  private toUtcInstant(localDate: Date, tzOffsetMinutes: number): Date {
    return new Date(localDate.getTime() - tzOffsetMinutes * 60_000);
  }

  private resolveRange(
    granularity: 'hour' | 'day' | 'month',
    tzOffsetMinutes: number,
    date?: string,
  ): {
    start: Date;
    end: Date;
    truncUnit: string;
    buckets: Array<{ key: string; label: string }>;
  } {
    const localNow = this.toLocal(new Date(), tzOffsetMinutes);

    if (granularity === 'hour') {
      const day = date ?? localNow.toISOString().slice(0, 10);
      const [year, mon, dayOfMonth] = day.split('-').map(Number);
      const localStart = new Date(Date.UTC(year, mon - 1, dayOfMonth));
      const start = this.toUtcInstant(localStart, tzOffsetMinutes);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const buckets = Array.from({ length: 24 }, (_, hour) => {
        const label = String(hour).padStart(2, '0');
        return { key: `${day}T${label}`, label };
      });
      return { start, end, truncUnit: 'hour', buckets };
    }

    if (granularity === 'day') {
      const month = date ?? localNow.toISOString().slice(0, 7);
      const [year, mon] = month.split('-').map(Number);
      const localStart = new Date(Date.UTC(year, mon - 1, 1));
      const localEnd = new Date(Date.UTC(year, mon, 1));
      const start = this.toUtcInstant(localStart, tzOffsetMinutes);
      const end = this.toUtcInstant(localEnd, tzOffsetMinutes);
      const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
      const buckets = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const label = String(day).padStart(2, '0');
        return { key: `${month}-${label}`, label };
      });
      return { start, end, truncUnit: 'day', buckets };
    }

    const year = date ? Number(date) : localNow.getUTCFullYear();
    const localStart = new Date(Date.UTC(year, 0, 1));
    const localEnd = new Date(Date.UTC(year + 1, 0, 1));
    const start = this.toUtcInstant(localStart, tzOffsetMinutes);
    const end = this.toUtcInstant(localEnd, tzOffsetMinutes);
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const label = String(i + 1).padStart(2, '0');
      return { key: `${year}-${label}`, label };
    });
    return { start, end, truncUnit: 'month', buckets };
  }

  private bucketKey(granularity: 'hour' | 'day' | 'month', bucket: Date): string {
    const d = new Date(bucket);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hour = String(d.getUTCHours()).padStart(2, '0');

    if (granularity === 'hour') return `${year}-${month}-${day}T${hour}`;
    if (granularity === 'day') return `${year}-${month}-${day}`;
    return `${year}-${month}`;
  }
}
