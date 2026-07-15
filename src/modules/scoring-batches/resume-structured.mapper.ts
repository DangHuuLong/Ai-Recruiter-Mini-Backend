import { ResumeStructuredInputDto } from './dto/resume-structured-input.dto';
import { ParsedResumeData } from '../../common/types/ai-service.types';

/** Maps the camelCase structured-form DTO to the AI service's snake_case ParsedResumeData shape. */
export function mapStructuredResumeToParsedData(input: ResumeStructuredInputDto): ParsedResumeData {
  return {
    personal: {
      full_name: input.personal?.fullName ?? null,
      email: input.personal?.email ?? null,
      phone: input.personal?.phone ?? null,
      location: input.personal?.location ?? null,
      linkedin_url: input.personal?.linkedinUrl ?? null,
      github_url: input.personal?.githubUrl ?? null,
      portfolio_url: input.personal?.portfolioUrl ?? null,
    },
    summary: input.summary ?? null,
    skills: (input.skills ?? []).map((skill) => ({
      name: skill.name,
      normalized_name: skill.name.trim().toLowerCase(),
      category: skill.category ?? null,
      evidence: skill.evidence ?? null,
      level: skill.level ?? null,
    })),
    education: (input.education ?? []).map((education) => ({
      institution: education.institution ?? null,
      degree: education.degree ?? null,
      field_of_study: education.fieldOfStudy ?? null,
      start_year: education.startYear ?? null,
      end_year: education.endYear ?? null,
      gpa: education.gpa ?? null,
      gpa_scale: education.gpaScale ?? null,
      description: education.description ?? null,
    })),
    experience: (input.experience ?? []).map((experience) => ({
      company: experience.company ?? null,
      role: experience.role ?? null,
      location: experience.location ?? null,
      start_date: experience.startDate ?? null,
      end_date: experience.endDate ?? null,
      duration_months: experience.durationMonths ?? null,
      responsibilities: experience.responsibilities ?? [],
      technologies: experience.technologies ?? [],
    })),
    projects: (input.projects ?? []).map((project) => ({
      name: project.name ?? null,
      role: project.role ?? null,
      start_date: project.startDate ?? null,
      end_date: project.endDate ?? null,
      description: project.description ?? null,
      technologies: project.technologies ?? [],
      urls: project.urls ?? [],
    })),
    certifications: (input.certifications ?? []).map((certification) => ({
      name: certification.name ?? null,
      issuer: certification.issuer ?? null,
      issued_year: certification.issuedYear ?? null,
      url: certification.url ?? null,
    })),
    achievements: (input.achievements ?? []).map((achievement) => ({
      title: achievement.title ?? null,
      description: achievement.description ?? null,
      year: achievement.year ?? null,
    })),
    languages: (input.languages ?? []).map((language) => ({
      name: language.name,
      proficiency: language.proficiency ?? null,
    })),
  };
}
