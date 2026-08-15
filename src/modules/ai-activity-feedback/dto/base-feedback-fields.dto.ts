// Fields shared by both feedback-submission entry points (enterprise + public) — the 4 questions
// from the feedback form. `reasons` is only required when accuracy isn't ACCURATE, which
// class-validator can't express declaratively, so that cross-field check runs in the service layer.
import { FeedbackAccuracy, FeedbackSpeed } from '@prisma/client';
import { IsArray, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { FEEDBACK_REASON_SLUGS, type FeedbackReasonSlug } from '../ai-activity-feedback.constants';

export class BaseFeedbackFieldsDto {
  @IsEnum(FeedbackAccuracy)
  accuracy: FeedbackAccuracy;

  @IsOptional()
  @IsArray()
  @IsIn(FEEDBACK_REASON_SLUGS, { each: true })
  reasons?: FeedbackReasonSlug[];

  @IsEnum(FeedbackSpeed)
  speed: FeedbackSpeed;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
