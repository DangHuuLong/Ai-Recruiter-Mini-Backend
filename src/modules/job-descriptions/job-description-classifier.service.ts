import { Injectable, Logger } from '@nestjs/common';
import { OccupationFamily } from '@prisma/client';

import { INTERVIEW_QUESTION_TAXONOMY } from '../../common/constants/interview-question-taxonomy';
import { ParsedJobDescriptionData } from '../../common/types/ai-service.types';
import { MultiProviderCompletionService } from '../../integrations/llm-providers/multi-provider-completion.service';

export interface JobDescriptionClassification {
  occupationFamily: OccupationFamily;
  specialization: string;
}

function buildPrompt(parsedData: ParsedJobDescriptionData): string {
  const taxonomyList = INTERVIEW_QUESTION_TAXONOMY.map(
    (entry) => `- ${entry.occupationFamily}: ${entry.specializations.join(', ')}`,
  ).join('\n');

  const requiredSkills = parsedData.required_skills.map((s) => s.name).join(', ');
  const preferredSkills = parsedData.preferred_skills.map((s) => s.name).join(', ');

  return `Classify this job description into exactly one occupationFamily + specialization pair from the list below, or return null for both if it doesn't clearly fit any of them. Do not guess — only classify if there's a clear match.

Allowed pairs (occupationFamily: specializations):
${taxonomyList}

Job description:
Title: ${parsedData.title ?? '(none)'}
Responsibilities: ${parsedData.responsibilities.join('; ')}
Requirements: ${parsedData.requirements.join('; ')}
Required skills: ${requiredSkills}
Preferred skills: ${preferredSkills}
Domain keywords: ${parsedData.domain_keywords.join(', ')}

Return pure JSON only, no markdown fence, no explanation. Shape: { "occupationFamily": string | null, "specialization": string | null }`;
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

@Injectable()
export class JobDescriptionClassifierService {
  private readonly logger = new Logger(JobDescriptionClassifierService.name);

  constructor(private readonly completionService: MultiProviderCompletionService) {}

  // Never throws — classification is a nice-to-have, must not break parse().
  async classify(parsedData: ParsedJobDescriptionData): Promise<JobDescriptionClassification | null> {
    try {
      const raw = await this.completionService.generate(buildPrompt(parsedData));
      const parsed = JSON.parse(stripMarkdownFence(raw)) as {
        occupationFamily?: string | null;
        specialization?: string | null;
      };

      if (!parsed.occupationFamily || !parsed.specialization) {
        return null;
      }

      const taxonomyEntry = INTERVIEW_QUESTION_TAXONOMY.find(
        (entry) => entry.occupationFamily === parsed.occupationFamily,
      );
      if (!taxonomyEntry || !taxonomyEntry.specializations.includes(parsed.specialization)) {
        this.logger.warn(`Classifier returned an unknown pair, discarding: ${JSON.stringify(parsed)}`);
        return null;
      }

      return {
        occupationFamily: parsed.occupationFamily as OccupationFamily,
        specialization: parsed.specialization,
      };
    } catch (error) {
      this.logger.warn(`JD classification failed, leaving occupationFamily/specialization unset: ${String(error)}`);
      return null;
    }
  }
}
