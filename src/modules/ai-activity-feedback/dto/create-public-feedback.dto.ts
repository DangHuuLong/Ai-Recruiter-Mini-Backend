// Body for POST /public/feedback — anonymous callers have no evaluationId (public batches never
// persist to Postgres), so they identify the scored cell directly instead.
import { IsNotEmpty, IsString } from 'class-validator';

import { BaseFeedbackFieldsDto } from './base-feedback-fields.dto';

export class CreatePublicFeedbackDto extends BaseFeedbackFieldsDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsString()
  @IsNotEmpty()
  resumeItemId: string;

  @IsString()
  @IsNotEmpty()
  jdItemId: string;
}
