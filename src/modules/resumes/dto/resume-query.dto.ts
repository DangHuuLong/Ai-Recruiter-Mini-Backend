import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { ParseStatusEnum } from '../../../common/enums';

export class ResumeQueryDto {
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
  candidateId?: string;

  @IsOptional()
  @IsEnum(ParseStatusEnum)
  parseStatus?: ParseStatusEnum;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'uploadedAt'])
  sortBy: 'createdAt' | 'updatedAt' | 'uploadedAt' = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
