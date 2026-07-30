// Body for POST /job-descriptions — raw job description fields prior to AI parsing.
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateJobDescriptionDto {
  @IsString()
  @MaxLength(200)
  title!: string;

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

  @IsString()
  rawText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parserVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  createdById?: string;
}
