import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { JobDescriptionInputDto } from './job-description-input.dto';
import { ResumeFileRefDto } from './resume-file-ref.dto';

export class CreateScoringBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ValidateNested({ each: true })
  @Type(() => ResumeFileRefDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  resumeFiles!: ResumeFileRefDto[];

  @ValidateNested({ each: true })
  @Type(() => JobDescriptionInputDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  jobDescriptions!: JobDescriptionInputDto[];

  @IsOptional()
  @IsString()
  evaluationConfigId?: string;

  @IsOptional()
  @IsUrl()
  notifyWebhookUrl?: string;

  @IsOptional()
  @IsEmail()
  notifyEmail?: string;
}
