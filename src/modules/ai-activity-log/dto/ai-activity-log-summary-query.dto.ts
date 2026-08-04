// Query params for GET /ai-activity-logs/stats/summary.
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class AiActivityLogSummaryQueryDto {
  // See AiActivityLogTimeseriesQueryDto.tzOffsetMinutes for what this shifts and why.
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(-720)
  @Max(840)
  tzOffsetMinutes = 0;
}
