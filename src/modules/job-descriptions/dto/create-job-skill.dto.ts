// Body for POST /job-descriptions/:id/skills — a single required/preferred skill entry.
import { JobSkillType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class CreateJobSkillDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  normalizedName?: string;

  @IsEnum(JobSkillType)
  type!: JobSkillType;

  @IsOptional()
  @IsBoolean()
  isCore?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weightHint?: number;
}
