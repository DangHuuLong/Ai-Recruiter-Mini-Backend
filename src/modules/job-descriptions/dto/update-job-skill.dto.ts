import { JobSkillType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';

export class UpdateJobSkillDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  normalizedName?: string;

  @IsOptional()
  @IsEnum(JobSkillType)
  type?: JobSkillType;

  @IsOptional()
  @IsBoolean()
  isCore?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weightHint?: number;
}
