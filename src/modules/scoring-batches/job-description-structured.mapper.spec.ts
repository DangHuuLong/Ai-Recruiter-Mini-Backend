import { describe, expect, it } from '@jest/globals';

import { mapStructuredJdToParsedData } from './job-description-structured.mapper';
import { JobDescriptionStructuredInputDto } from './dto/job-description-structured-input.dto';

describe('mapStructuredJdToParsedData', () => {
  it('maps a fully populated input into snake_case ParsedJobDescriptionData', () => {
    const input: JobDescriptionStructuredInputDto = {
      title: 'Senior Backend Engineer',
      seniority: 'Senior',
      employmentType: 'Full-time',
      responsibilities: ['Own core services'],
      requirements: ['5+ years Node.js'],
      niceToHave: ['AWS experience'],
      requiredSkills: [{ name: 'Node.js', isCore: true, weightHint: 0.8 }],
      preferredSkills: [{ name: 'Docker' }],
      minExperienceYears: 5,
      educationRequirement: "Bachelor's degree",
      domainKeywords: ['fintech'],
    } as JobDescriptionStructuredInputDto;

    const result = mapStructuredJdToParsedData(input);

    expect(result.title).toBe('Senior Backend Engineer');
    expect(result.employment_type).toBe('Full-time');
    expect(result.required_skills[0]).toEqual({
      name: 'Node.js',
      normalized_name: 'node.js',
      is_core: true,
      weight_hint: 0.8,
    });
    expect(result.preferred_skills[0]).toEqual({
      name: 'Docker',
      normalized_name: 'docker',
      is_core: false,
      weight_hint: 1,
    });
    expect(result.min_experience_years).toBe(5);
    expect(result.domain_keywords).toEqual(['fintech']);
  });

  it('defaults every array field to [] and every optional scalar to null when absent', () => {
    const result = mapStructuredJdToParsedData({} as JobDescriptionStructuredInputDto);

    expect(result.title).toBeNull();
    expect(result.seniority).toBeNull();
    expect(result.employment_type).toBeNull();
    expect(result.responsibilities).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.nice_to_have).toEqual([]);
    expect(result.required_skills).toEqual([]);
    expect(result.preferred_skills).toEqual([]);
    expect(result.min_experience_years).toBeNull();
    expect(result.education_requirement).toBeNull();
    expect(result.domain_keywords).toEqual([]);
  });

  it('defaults isCore to false and weightHint to 1 for a skill with only a name', () => {
    const result = mapStructuredJdToParsedData({
      requiredSkills: [{ name: '  PostgreSQL  ' }],
    } as JobDescriptionStructuredInputDto);

    expect(result.required_skills[0]).toEqual({
      name: '  PostgreSQL  ',
      normalized_name: 'postgresql',
      is_core: false,
      weight_hint: 1,
    });
  });
});
