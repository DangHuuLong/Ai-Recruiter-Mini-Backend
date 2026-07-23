// Query params for GET /scoring-batches — pagination, status filter, and sorting.
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ScoringBatchStatus } from '@prisma/client';

export class ScoringBatchQueryDto {
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
  limit = 10;

  @IsOptional()
  @IsEnum(ScoringBatchStatus)
  status?: ScoringBatchStatus;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'name'])
  sortBy: 'createdAt' | 'updatedAt' | 'name' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
