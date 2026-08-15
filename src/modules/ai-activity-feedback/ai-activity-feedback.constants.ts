// Allowed slugs for AiActivityFeedback.reasons — question 2 of the feedback form, only shown
// (and required) when accuracy is OK or INACCURATE.
export const FEEDBACK_REASON_SLUGS = [
  'SCORE_TOO_LOW',
  'SCORE_TOO_HIGH',
  'MISSING_SKILLS',
  'WRONG_SKILLS',
  'WRONG_EXTRACTION',
  'WRONG_INTERVIEW_QUESTIONS',
  'OTHER',
] as const;

export type FeedbackReasonSlug = (typeof FEEDBACK_REASON_SLUGS)[number];
