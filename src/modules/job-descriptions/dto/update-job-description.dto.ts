import { OccupationFamily } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateJobDescriptionDto {
  // Manual override for JobDescriptionClassifierService's guess — both or neither.
  @IsOptional()
  @IsEnum(OccupationFamily)
  occupationFamily?: OccupationFamily;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  specialization?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  employmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  seniority?: string;

  @IsOptional()
  @IsString()
  rawText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parserVersion?: string;
}
