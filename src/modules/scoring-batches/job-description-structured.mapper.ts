import { JobDescriptionStructuredInputDto } from './dto/job-description-structured-input.dto';
import { ParsedJobDescriptionData } from '../../common/types/ai-service.types';

/** Maps the camelCase structured-form DTO to the AI service's snake_case ParsedJobDescriptionData shape. */
export function mapStructuredJdToParsedData(
  input: JobDescriptionStructuredInputDto,
): ParsedJobDescriptionData {
  return {
    title: input.title ?? null,
    seniority: input.seniority ?? null,
    employment_type: input.employmentType ?? null,
    responsibilities: input.responsibilities ?? [],
    requirements: input.requirements ?? [],
    nice_to_have: input.niceToHave ?? [],
    required_skills: (input.requiredSkills ?? []).map((skill) => ({
      name: skill.name,
      normalized_name: skill.name.trim().toLowerCase(),
      is_core: skill.isCore ?? false,
      weight_hint: skill.weightHint ?? 1,
    })),
    preferred_skills: (input.preferredSkills ?? []).map((skill) => ({
      name: skill.name,
      normalized_name: skill.name.trim().toLowerCase(),
      is_core: skill.isCore ?? false,
      weight_hint: skill.weightHint ?? 1,
    })),
    min_experience_years: input.minExperienceYears ?? null,
    education_requirement: input.educationRequirement ?? null,
    domain_keywords: input.domainKeywords ?? [],
  };
}
