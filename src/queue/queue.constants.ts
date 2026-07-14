export const QUEUE_NAMES = {
  RESUME_PARSE: 'resume-parse',
  JD_PARSE: 'jd-parse',
  SCORE_PAIR: 'score-pair',
  NOTIFY: 'notify',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type BatchTier = 'ENTERPRISE' | 'PUBLIC';
