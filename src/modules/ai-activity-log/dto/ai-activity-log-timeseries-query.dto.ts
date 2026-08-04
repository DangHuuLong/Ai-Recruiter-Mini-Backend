// Query params for GET /ai-activity-logs/stats/timeseries.
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class AiActivityLogTimeseriesQueryDto {
  @IsIn(['hour', 'day', 'month'])
  granularity!: 'hour' | 'day' | 'month';

  // hour  -> YYYY-MM-DD (one day, in the caller's local timezone)
  // day   -> YYYY-MM    (one month, in the caller's local timezone)
  // month -> YYYY       (one year, in the caller's local timezone)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  date?: string;

  // Minutes to ADD to UTC to get the caller's local time (e.g. Vietnam/UTC+7 -> 420),
  // i.e. `-Date.prototype.getTimezoneOffset()` from the browser. Used so "today"/hour
  // labels reflect the viewer's wall clock instead of the server's UTC — see
  // AiActivityLogService for why a fixed offset (not a full IANA timezone) is enough here.
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(-720)
  @Max(840)
  tzOffsetMinutes = 0;
}
