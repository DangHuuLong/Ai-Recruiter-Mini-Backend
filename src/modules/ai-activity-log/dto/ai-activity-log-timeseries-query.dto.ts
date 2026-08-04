// Query params for GET /ai-activity-logs/stats/timeseries.
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class AiActivityLogTimeseriesQueryDto {
  @IsIn(['hour', 'day', 'month'])
  granularity!: 'hour' | 'day' | 'month';

  // hour  -> YYYY-MM-DD (one day)
  // day   -> YYYY-MM    (one month)
  // month -> YYYY       (one year)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  date?: string;
}
