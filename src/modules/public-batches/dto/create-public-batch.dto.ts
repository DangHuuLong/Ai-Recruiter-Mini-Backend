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

import { JobDescriptionFileRefDto } from '../../scoring-batches/dto/job-description-file-ref.dto';
import { JobDescriptionInputDto } from '../../scoring-batches/dto/job-description-input.dto';
import { JobDescriptionStructuredInputDto } from '../../scoring-batches/dto/job-description-structured-input.dto';
import { ResumeFileRefDto } from '../../scoring-batches/dto/resume-file-ref.dto';
import { ResumeStructuredInputDto } from '../../scoring-batches/dto/resume-structured-input.dto';
import { ResumeTextInputDto } from '../../scoring-batches/dto/resume-text-input.dto';

// No evaluationConfigId — public batches always use DEFAULT_EVALUATION_CRITERIA.
export class CreatePublicBatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeFileRefDto)
  @ArrayMaxSize(50)
  resumeFiles?: ResumeFileRefDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeTextInputDto)
  @ArrayMaxSize(50)
  resumeTexts?: ResumeTextInputDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredInputDto)
  @ArrayMaxSize(50)
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
  @IsUrl()
  notifyWebhookUrl?: string;

  @IsOptional()
  @IsEmail()
  notifyEmail?: string;
}
