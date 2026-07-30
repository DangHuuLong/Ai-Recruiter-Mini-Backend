// Default weighted evaluation criteria used to score a Candidate against a JobDescription.
import { CriterionName } from '@prisma/client';

import { ScoreCriterionConfig } from '../types/ai-service.types';

export const DEFAULT_EVALUATION_CRITERIA: ScoreCriterionConfig[] = [
  { criterion: CriterionName.SKILLS_MATCH, weight: 0.35 },
  { criterion: CriterionName.EXPERIENCE_RELEVANCE, weight: 0.3 },
  { criterion: CriterionName.PROJECT_RELEVANCE, weight: 0.15 },
  { criterion: CriterionName.EDUCATION_CERTIFICATION, weight: 0.1 },
  { criterion: CriterionName.KEYWORD_DOMAIN_ALIGNMENT, weight: 0.1 },
];
