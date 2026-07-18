import { Injectable, Logger } from '@nestjs/common';
import { CriterionName, OccupationFamily, SkillMatchType } from '@prisma/client';

import { AppException } from '../../../common/exceptions/app.exception';
import { EvaluationResult } from '../../../common/types/ai-service.types';
import { InterviewQuestionsService } from '../../interview-questions/interview-questions.service';

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

export interface JobDescriptionTaxonomy {
  occupationFamily: OccupationFamily | null;
  specialization: string | null;
}

// Structural type covering both SearchResultRow and the row returned by
// InterviewQuestionsService.create() — the two shapes searchOrGenerate() can return.
interface RetrievedQuestionLike {
  questionText: string;
  competency: string;
  experienceBucket: string;
  rubric: string[];
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
  private readonly logger = new Logger(ScoringResultMapperService.name);

  constructor(private readonly interviewQuestionsService: InterviewQuestionsService) {}

  // Prefers the retrieval-backed question bank when the JD is classified; falls back to the
  // AI service's rule-based questions otherwise (or if retrieval fails/comes up empty) — this
  // fallback must never throw, since a broken retrieval path must not fail evaluation/scoring.
  async buildInterviewQuestions(
    taxonomy: JobDescriptionTaxonomy | null,
    result: EvaluationResult,
  ): Promise<MappedInterviewQuestion[]> {
    if (taxonomy?.occupationFamily && taxonomy.specialization) {
      try {
        const queryText = this.buildInterviewQuestionQueryText(result);
        if (queryText) {
          const { existing, generated } = await this.interviewQuestionsService.searchOrGenerate({
            queryText,
            occupationFamily: taxonomy.occupationFamily,
            specialization: taxonomy.specialization,
            limit: 5,
          });
          const combined: RetrievedQuestionLike[] = [...existing, ...generated];
          if (combined.length > 0) {
            return combined.map((item, index) => this.toMappedInterviewQuestion(item, index));
          }
        }
      } catch (error) {
        this.logger.warn(`Interview-question retrieval failed, falling back to AI-service questions: ${String(error)}`);
      }
    }

    return this.mapInterviewQuestions(result);
  }

  private buildInterviewQuestionQueryText(result: EvaluationResult): string | null {
    if (result.skill_gap_summary?.trim()) {
      return result.skill_gap_summary.trim();
    }
    const missingSkills = result.skills.filter((s) => s.type === 'MISSING').map((s) => s.skill_name);
    return missingSkills.length > 0 ? `Candidate is missing these skills: ${missingSkills.join(', ')}` : null;
  }

  private toMappedInterviewQuestion(item: RetrievedQuestionLike, index: number): MappedInterviewQuestion {
    const difficulty =
      item.experienceBucket === 'EIGHT_PLUS' ? 'HARD' : item.experienceBucket === 'FIVE_TO_EIGHT' ? 'MEDIUM' : 'EASY';

    return {
      question: item.questionText,
      category: item.competency,
      linkedSkill: null,
      difficulty,
      rationale: item.rubric.join('; '),
      displayOrder: index + 1,
    };
  }

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
