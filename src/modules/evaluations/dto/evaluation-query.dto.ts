// Query params for GET /evaluations — pagination, filters, search, and sorting.
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { EvaluationStatusEnum } from '../../../common/enums';

export class EvaluationQueryDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;

  @IsOptional()
  @IsString()
  configId?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsEnum(EvaluationStatusEnum)
  status?: EvaluationStatusEnum;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'startedAt', 'completedAt', 'overallScore'])
  sortBy: 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt' | 'overallScore' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
