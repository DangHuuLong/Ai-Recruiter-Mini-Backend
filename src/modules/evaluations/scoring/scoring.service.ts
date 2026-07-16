import { Injectable } from '@nestjs/common';
import { CriterionName, SkillMatchType } from '@prisma/client';

import { AppException } from '../../../common/exceptions/app.exception';
import { EvaluationResult } from '../../../common/types/ai-service.types';

export interface MappedCriterion {
  criterion: string;
  weight: number;
  scoreNormalized: number;
  reason: string;
  evidence: unknown;
}

export interface MappedSkill {
  skillName: string;
  normalizedSkillName: string;
  type: string;
  importance: string;
  evidence: string | null;
  note: string | null;
}

export interface MappedInterviewQuestion {
  question: string;
  category: string;
  linkedSkill: string | null;
  difficulty: string;
  rationale: string;
  displayOrder: number;
}

/**
 * Shared AI-service-result-to-persistence mapping, used by both the
 * single-application EvaluationsService (relational rows) and the
 * score-pair queue processor (denormalized JSON on ScoringBatchResult).
 * Callers own the persistence shape; this only clamps/normalizes the
 * AI service's raw snake_case response.
 */
@Injectable()
export class ScoringResultMapperService {
  mapCriteria(result: EvaluationResult): MappedCriterion[] {
    return result.criteria.map((item) => ({
      criterion: item.criterion,
      weight: this.clamp01(item.weight),
      scoreNormalized: this.clamp01(item.score_normalized),
      reason: item.reason,
      evidence: item.evidence,
    }));
  }

  mapSkills(result: EvaluationResult): MappedSkill[] {
    return result.skills.map((item) => ({
      skillName: item.skill_name,
      normalizedSkillName: item.normalized_skill_name,
      type: item.type,
      importance: item.importance,
      evidence: item.evidence,
      note: item.note,
    }));
  }

  mapInterviewQuestions(result: EvaluationResult): MappedInterviewQuestion[] {
    return result.interview_questions.map((item, index) => ({
      question: item.question,
      category: item.category,
      linkedSkill: item.linked_skill,
      difficulty: item.difficulty,
      rationale: item.rationale,
      displayOrder: item.display_order ?? index + 1,
    }));
  }

  calculateOverallScore(criteria: Array<{ scoreNormalized: number; weight: number }>): number {
    const score = criteria.reduce((total, item) => total + item.scoreNormalized * item.weight * 100, 0);

    return Math.round(score * 100) / 100;
  }

  /** Converts an AI-service criterion string to the Prisma enum, for callers that persist relational rows. */
  toCriterionName(value: string): CriterionName {
    if (Object.values(CriterionName).includes(value as CriterionName)) {
      return value as CriterionName;
    }

    throw new AppException(`Unsupported criterion: ${value}`, 502);
  }

  /** Converts an AI-service skill match type to the Prisma enum, for callers that persist relational rows. */
  toSkillMatchType(value: string): SkillMatchType {
    if (value === 'PARTIAL') {
      return SkillMatchType.RELATED;
    }

    if (Object.values(SkillMatchType).includes(value as SkillMatchType)) {
      return value as SkillMatchType;
    }

    throw new AppException(`Unsupported skill match type: ${value}`, 502);
  }

  private clamp01(value: number): number {
    return Math.min(Math.max(value, 0), 1);
  }
}
