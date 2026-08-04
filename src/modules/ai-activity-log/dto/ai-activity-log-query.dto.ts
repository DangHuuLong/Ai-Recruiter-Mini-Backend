// Query params for GET /ai-activity-logs — pagination plus optional functionType/tier/status/organizationId/date-range filters.
import { Transform } from 'class-transformer';
import { AiCallStatus, AiCallTier, AiFunctionType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AiActivityLogQueryDto {
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
  @IsEnum(AiFunctionType)
  functionType?: AiFunctionType;

  @IsOptional()
  @IsEnum(AiCallTier)
  tier?: AiCallTier;

  @IsOptional()
  @IsEnum(AiCallStatus)
  status?: AiCallStatus;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  resumeId?: string;

  @IsOptional()
  @IsString()
  jobDescriptionId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
