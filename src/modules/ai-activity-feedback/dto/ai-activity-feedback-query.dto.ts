// Query params for GET /ai-activity-feedback — pagination plus optional accuracy/tier/date-range filters.
import { Transform } from 'class-transformer';
import { AiCallTier, FeedbackAccuracy } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, Min, Max } from 'class-validator';

export class AiActivityFeedbackQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(FeedbackAccuracy)
  accuracy?: FeedbackAccuracy;

  @IsOptional()
  @IsEnum(AiCallTier)
  tier?: AiCallTier;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
