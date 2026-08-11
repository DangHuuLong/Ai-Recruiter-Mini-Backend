// Body for POST /evaluations/:id/feedback — evaluationId/organizationId come from the route param
// and the authenticated user, not the body.
import { BaseFeedbackFieldsDto } from './base-feedback-fields.dto';

export class CreateEvaluationFeedbackDto extends BaseFeedbackFieldsDto {}
