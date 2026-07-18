import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InterviewQuestionSource, OccupationFamily, QuestionQualityGateStatus } from '@prisma/client';

import { CreateInterviewQuestionDto } from './dto/create-interview-question.dto';
import { INTERVIEW_QUESTION_TAXONOMY } from '../../common/constants/interview-question-taxonomy';
import { MultiProviderCompletionService } from '../../integrations/llm-providers/multi-provider-completion.service';

interface GenerateParams {
  queryText: string;
  occupationFamily: OccupationFamily;
  specialization: string;
  enablers?: string[];
  count: number;
}

// Generic counterpart to the hand-written per-industry seed prompts — must
// work for any occupationFamily/specialization, so it leans on taxonomy
// vocabulary instead of an embedded "existing questions" list.
function buildPrompt(params: GenerateParams): string {
  const taxonomyEntry = INTERVIEW_QUESTION_TAXONOMY.find(
    (entry) => entry.occupationFamily === params.occupationFamily,
  );
  const exampleEnablers = taxonomyEntry?.enablers.join(', ') ?? '';
  const exampleBusinessContexts = taxonomyEntry?.businessContexts.join(', ') ?? '';
  const enablersHint =
    params.enablers && params.enablers.length > 0
      ? `Particularly relevant tools/methods for this request: ${params.enablers.join(', ')}.`
      : '';

  return `You are an expert technical interviewer for the "${params.specialization}" specialization within the "${params.occupationFamily}" occupation family. Generate exactly ${params.count} high-quality interview questions directly relevant to this context: "${params.queryText}"
${enablersHint}

Example enablers used in this occupation family (for inspiration only, not mandatory): ${exampleEnablers}
Example business contexts used in this occupation family (for inspiration only, not mandatory): ${exampleBusinessContexts}

Each question must be genuinely relevant to the given context, not generic filler. Vary competencyType/assessmentTarget/questionType across the set rather than repeating the same combination.

Return pure JSON only, no markdown code fence, no explanation before or after. Shape: { "items": [ {...}, {...} ] }. Each item must match this schema exactly:
{
  "questionText": string (required, max 2000 chars, in English),
  "occupationFamily": "${params.occupationFamily}",
  "specialization": "${params.specialization}",
  "enablers": string[] (empty array if none apply — do not invent tools),
  "businessContext": string (max 150 chars, in English),
  "competency": string (max 150 chars, in English),
  "competencyType": "HARD_SKILL" | "TOOL_SKILL" | "KNOWLEDGE_AREA" | "SOFT_SKILL" | "METHODOLOGY" | "COMPLIANCE",
  "assessmentTarget": "RECALL" | "APPLICATION" | "ANALYSIS" | "DECISION_MAKING" | "COMMUNICATION" | "LEADERSHIP" | "OWNERSHIP",
  "experienceBucket": "ZERO_TO_ONE" | "TWO_TO_FOUR" | "FIVE_TO_EIGHT" | "EIGHT_PLUS",
  "autonomyLevel": "WORKS_INDEPENDENTLY" | "LEADS_PROJECTS" | "DEFINES_STRATEGY" | "MANAGES_PEOPLE",
  "questionType": "EXPERIENCE_VALIDATION" | "ARTIFACT_DISCUSSION" | "DECISION_MAKING" | "BEHAVIORAL_EVIDENCE" | "REFLECTION" | "KNOWLEDGE_CHECK",
  "rubric": string[] (at least 1 item, 2-4 key points a good answer should cover — not a full model answer)
}`;
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

@Injectable()
export class InterviewQuestionGeneratorService {
  private readonly logger = new Logger(InterviewQuestionGeneratorService.name);

  constructor(private readonly completionService: MultiProviderCompletionService) {}

  // Never throws on a bad LLM response — returns whatever validated items it could salvage (possibly zero).
  async generate(params: GenerateParams): Promise<CreateInterviewQuestionDto[]> {
    let raw: string;
    try {
      raw = await this.completionService.generate(buildPrompt(params));
    } catch (error) {
      this.logger.warn(`AI fallback generation failed for ${params.occupationFamily}/${params.specialization}: ${String(error)}`);
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripMarkdownFence(raw));
    } catch (error) {
      this.logger.warn(`AI fallback returned non-JSON output, discarding: ${String(error)}`);
      return [];
    }

    const items = (parsed as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) {
      this.logger.warn('AI fallback JSON missing "items" array, discarding');
      return [];
    }

    const validated: CreateInterviewQuestionDto[] = [];
    for (const item of items) {
      const candidate = plainToInstance(CreateInterviewQuestionDto, {
        ...(item as Record<string, unknown>),
        // Never trust the model to echo these back correctly.
        occupationFamily: params.occupationFamily,
        specialization: params.specialization,
        source: InterviewQuestionSource.AI_GENERATED,
        qualityGateStatus: QuestionQualityGateStatus.PENDING_REVIEW,
      });

      const errors = await validate(candidate);
      if (errors.length > 0) {
        this.logger.warn(`Discarding one AI-generated item that failed validation: ${errors.map((e) => e.property).join(', ')}`);
        continue;
      }
      validated.push(candidate);
    }

    return validated;
  }
}
