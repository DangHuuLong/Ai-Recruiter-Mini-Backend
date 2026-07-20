// Maps raw AI-service evaluation results into persistence-ready criteria, skills, and interview question rows.
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

interface RetrievedQuestionLike {
  questionText: string;
  competency: string;
  experienceBucket: string;
  rubric: string[];
}

@Injectable()
export class ScoringResultMapperService {
  private readonly logger = new Logger(ScoringResultMapperService.name);

  constructor(private readonly interviewQuestionsService: InterviewQuestionsService) {}

  // Called by EvaluationsService.persistSuccessfulEvaluation() — tries the retrieval-based question bank via InterviewQuestionsService, falling back to the AI-service's own questions.
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

  // Called by buildInterviewQuestions() to derive the search query text from the skill gap summary or missing skills.
  private buildInterviewQuestionQueryText(result: EvaluationResult): string | null {
    if (result.skill_gap_summary?.trim()) {
      return result.skill_gap_summary.trim();
    }
    const missingSkills = result.skills.filter((s) => s.type === 'MISSING').map((s) => s.skill_name);
    return missingSkills.length > 0 ? `Candidate is missing these skills: ${missingSkills.join(', ')}` : null;
  }

  // Called by buildInterviewQuestions() to convert a retrieved/generated question bank entry into the persistence row shape.
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

  // Called by EvaluationsService.persistSuccessfulEvaluation() — clamps and reshapes raw AI criteria scores for storage.
  mapCriteria(result: EvaluationResult): MappedCriterion[] {
    return result.criteria.map((item) => ({
      criterion: item.criterion,
      weight: this.clamp01(item.weight),
      scoreNormalized: this.clamp01(item.score_normalized),
      reason: item.reason,
      evidence: item.evidence,
    }));
  }

  // Called by EvaluationsService.persistSuccessfulEvaluation() — reshapes raw AI skill results for storage.
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

  // Fallback used by buildInterviewQuestions() when no retrieval/generated questions are available — reshapes the AI-service's own questions.
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

  // Called by EvaluationsService.persistSuccessfulEvaluation() — computes the weighted overall score stored on the evaluation.
  calculateOverallScore(criteria: Array<{ scoreNormalized: number; weight: number }>): number {
    const score = criteria.reduce((total, item) => total + item.scoreNormalized * item.weight * 100, 0);

    return Math.round(score * 100) / 100;
  }

  // Called by EvaluationsService.persistSuccessfulEvaluation() — validates an AI-returned criterion string against the Prisma enum.
  toCriterionName(value: string): CriterionName {
    if (Object.values(CriterionName).includes(value as CriterionName)) {
      return value as CriterionName;
    }

    throw new AppException(`Unsupported criterion: ${value}`, 502);
  }

  // Called by EvaluationsService.persistSuccessfulEvaluation() — maps an AI-returned skill match type to the Prisma enum.
  toSkillMatchType(value: string): SkillMatchType {
    if (value === 'PARTIAL') {
      return SkillMatchType.RELATED;
    }

    if (Object.values(SkillMatchType).includes(value as SkillMatchType)) {
      return value as SkillMatchType;
    }

    throw new AppException(`Unsupported skill match type: ${value}`, 502);
  }

  // Called by mapCriteria() to keep score/weight values within the valid 0-1 range.
  private clamp01(value: number): number {
    return Math.min(Math.max(value, 0), 1);
  }
}
