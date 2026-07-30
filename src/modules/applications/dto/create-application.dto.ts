// Body for POST /applications — links a candidate, resume, and job description into a new application.
import { IsOptional, IsString } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  candidateId!: string;

  @IsString()
  jobDescriptionId!: string;

  @IsString()
  resumeId!: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
