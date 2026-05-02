import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { ApplicationStatusEnum } from '../../../common/enums';

export class ApplicationQueryDto {
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
  candidateId?: string;

  @IsOptional()
  @IsString()
  jobDescriptionId?: string;

  @IsOptional()
  @IsString()
  resumeId?: string;

  @IsOptional()
  @IsEnum(ApplicationStatusEnum)
  status?: ApplicationStatusEnum;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'appliedAt', 'lastActivityAt'])
  sortBy: 'createdAt' | 'updatedAt' | 'appliedAt' | 'lastActivityAt' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
