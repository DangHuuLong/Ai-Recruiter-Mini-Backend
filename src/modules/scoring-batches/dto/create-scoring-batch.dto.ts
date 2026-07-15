import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { JobDescriptionFileRefDto } from './job-description-file-ref.dto';
import { JobDescriptionInputDto } from './job-description-input.dto';
import { JobDescriptionStructuredInputDto } from './job-description-structured-input.dto';
import { ResumeFileRefDto } from './resume-file-ref.dto';
import { ResumeStructuredInputDto } from './resume-structured-input.dto';
import { ResumeTextInputDto } from './resume-text-input.dto';

export class CreateScoringBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeFileRefDto)
  @ArrayMaxSize(2000)
  resumeFiles?: ResumeFileRefDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeTextInputDto)
  @ArrayMaxSize(2000)
  resumeTexts?: ResumeTextInputDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredInputDto)
  @ArrayMaxSize(2000)
  resumeStructured?: ResumeStructuredInputDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobDescriptionInputDto)
  @ArrayMaxSize(50)
  jobDescriptions?: JobDescriptionInputDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobDescriptionFileRefDto)
  @ArrayMaxSize(50)
  jobDescriptionFiles?: JobDescriptionFileRefDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobDescriptionStructuredInputDto)
  @ArrayMaxSize(50)
  jobDescriptionStructured?: JobDescriptionStructuredInputDto[];

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
