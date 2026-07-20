import { describe, expect, it } from '@jest/globals';
import { CriterionName, SkillMatchType } from '@prisma/client';

import { ScoringResultMapperService } from './scoring.service';
import { EvaluationResult } from '../../../common/types/ai-service.types';
import { AppException } from '../../../common/exceptions/app.exception';
import { InterviewQuestionsService } from '../../interview-questions/interview-questions.service';

function buildService() {
  return new ScoringResultMapperService({} as InterviewQuestionsService);
}

function buildResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    overall_score: 0,
    summary: '',
    criteria: [],
    skills: [],
    explanation: '',
    skill_gap_summary: '',
    interview_questions: [],
    evidence_map: {},
    ...overrides,
  };
}

describe('ScoringResultMapperService.mapCriteria', () => {
  it('reshapes criteria fields and clamps weight/score into [0, 1]', () => {
    const service = buildService();
    const result = buildResult({
      criteria: [
        { criterion: 'SKILLS_MATCH', weight: 1.5, score_normalized: -0.2, reason: 'r', evidence: ['e'] },
      ],
    });

    expect(service.mapCriteria(result)).toEqual([
      { criterion: 'SKILLS_MATCH', weight: 1, scoreNormalized: 0, reason: 'r', evidence: ['e'] },
    ]);
  });

  it('leaves in-range values untouched', () => {
    const service = buildService();
    const result = buildResult({
      criteria: [
        { criterion: 'SKILLS_MATCH', weight: 0.35, score_normalized: 0.8, reason: 'ok', evidence: [] },
      ],
    });

    expect(service.mapCriteria(result)[0]).toMatchObject({ weight: 0.35, scoreNormalized: 0.8 });
  });
});

describe('ScoringResultMapperService.mapSkills', () => {
  it('reshapes AI skill fields into MappedSkill', () => {
    const service = buildService();
    const result = buildResult({
      skills: [
        {
          skill_name: 'Node.js',
          normalized_skill_name: 'node.js',
          type: 'MATCHED',
          importance: 'HIGH',
          evidence: 'used at Acme',
          note: null,
        },
      ],
    });

    expect(service.mapSkills(result)).toEqual([
      {
        skillName: 'Node.js',
        normalizedSkillName: 'node.js',
        type: 'MATCHED',
        importance: 'HIGH',
        evidence: 'used at Acme',
        note: null,
      },
    ]);
  });
});

describe('ScoringResultMapperService.mapInterviewQuestions', () => {
  it('reshapes AI interview questions, preserving explicit display_order', () => {
    const service = buildService();
    const result = buildResult({
      interview_questions: [
        {
          question: 'Explain X',
          category: 'skill_gap',
          linked_skill: 'Docker',
          difficulty: 'MEDIUM',
          rationale: 'because Y',
          display_order: 3,
        },
      ],
    });

    expect(service.mapInterviewQuestions(result)).toEqual([
      {
        question: 'Explain X',
        category: 'skill_gap',
        linkedSkill: 'Docker',
        difficulty: 'MEDIUM',
        rationale: 'because Y',
        displayOrder: 3,
      },
    ]);
  });

  it('preserves an explicit display_order of 0 (nullish coalescing, not falsy check)', () => {
    const service = buildService();
    const result = buildResult({
      interview_questions: [
        {
          question: 'Q1',
          category: 'general_fit',
          linked_skill: null,
          difficulty: 'EASY',
          rationale: 'r',
          display_order: 0,
        },
      ],
    });

    expect(service.mapInterviewQuestions(result)[0].displayOrder).toBe(0);
  });

  it('falls back to array index + 1 when display_order is missing from a malformed AI response', () => {
    const service = buildService();
    const result = buildResult({
      interview_questions: [
        {
          question: 'Q1',
          category: 'general_fit',
          linked_skill: null,
          difficulty: 'EASY',
          rationale: 'r',
          display_order: undefined as unknown as number,
        },
      ],
    });

    expect(service.mapInterviewQuestions(result)[0].displayOrder).toBe(1);
  });
});

describe('ScoringResultMapperService.calculateOverallScore', () => {
  it('computes the weighted sum as a 0-100 score', () => {
    const service = buildService();
    const score = service.calculateOverallScore([
      { scoreNormalized: 0.8, weight: 0.5 },
      { scoreNormalized: 0.6, weight: 0.5 },
    ]);

    expect(score).toBe(70);
  });

  it('rounds to 2 decimal places', () => {
    const service = buildService();
    const score = service.calculateOverallScore([{ scoreNormalized: 1 / 3, weight: 1 }]);

    expect(score).toBe(33.33);
  });
});

describe('ScoringResultMapperService.toCriterionName', () => {
  it('accepts a valid CriterionName value', () => {
    const service = buildService();
    expect(service.toCriterionName('SKILLS_MATCH')).toBe(CriterionName.SKILLS_MATCH);
  });

  it('throws AppException(502) for an unrecognized value', () => {
    const service = buildService();
    expect(() => service.toCriterionName('NOT_A_CRITERION')).toThrow(AppException);
  });
});

describe('ScoringResultMapperService.toSkillMatchType', () => {
  it('maps the AI service PARTIAL value to SkillMatchType.RELATED', () => {
    const service = buildService();
    expect(service.toSkillMatchType('PARTIAL')).toBe(SkillMatchType.RELATED);
  });

  it('accepts a value that already matches a Prisma SkillMatchType', () => {
    const service = buildService();
    expect(service.toSkillMatchType('MATCHED')).toBe(SkillMatchType.MATCHED);
  });

  it('throws AppException(502) for an unrecognized value', () => {
    const service = buildService();
    expect(() => service.toSkillMatchType('NOT_A_TYPE')).toThrow(AppException);
  });
});
