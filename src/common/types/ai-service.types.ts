export interface AiServiceResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface AiServiceErrorItem {
  field?: string | null;
  message: string;
}

export interface AiServiceErrorResponse {
  success: false;
  message: string;
  errors?: AiServiceErrorItem[];
}

export interface AiHealthData {
  service: string;
  status: 'healthy' | 'unhealthy';
  version: string;
  environment: string;
  aiProvider: string;
}

// signed_url and raw_text are mutually-exclusive-in-practice inputs — at
// least one is required, and signed_url wins if both are set (AI service's
// own validation/branching rule, see docs/ai-service-contract.md §5).
export interface ParseResumeRequest {
  resume_id: string;
  file_name?: string;
  file_type?: string;
  signed_url?: string;
  raw_text?: string;
  checksum?: string | null;
}

export interface ParsedResumePersonalData {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
}

export interface ParsedResumeSkill {
  name: string;
  normalized_name: string;
  category: string | null;
  evidence: string | null;
  level?: string | null;
}

export interface ParsedResumeEducation {
  institution: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  gpa: string | null;
  gpa_scale: string | null;
  description: string | null;
}

export interface ParsedResumeExperience {
  company: string | null;
  role: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_months: number | null;
  responsibilities: string[];
  technologies: string[];
}

export interface ParsedResumeProject {
  name: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  technologies: string[];
  urls: string[];
}

export interface ParsedResumeCertification {
  name: string | null;
  issuer: string | null;
  issued_year: number | null;
  url: string | null;
}

export interface ParsedResumeAchievement {
  title: string | null;
  description: string | null;
  year: number | null;
}

export interface ParsedResumeLanguage {
  name: string;
  proficiency: string | null;
}

export interface ParsedResumeData {
  personal: ParsedResumePersonalData;
  summary: string | null;
  skills: ParsedResumeSkill[];
  education: ParsedResumeEducation[];
  experience: ParsedResumeExperience[];
  projects: ParsedResumeProject[];
  certifications: ParsedResumeCertification[];
  achievements: ParsedResumeAchievement[];
  languages: ParsedResumeLanguage[];
}

export interface ParseResumeResult {
  raw_text: string;
  parsed_data: ParsedResumeData;
  parser_version: string;
  warnings: string[];
  confidence: number | null;
  text_extraction_method: string;
}

// Same mutually-exclusive-in-practice rule as ParseResumeRequest: at least
// one of raw_text/signed_url required; signed_url wins if both are set.
export interface ParseJobDescriptionRequest {
  raw_text?: string;
  signed_url?: string;
  file_name?: string;
  file_type?: string;
}

export interface ParsedJobSkill {
  name: string;
  normalized_name: string;
  is_core: boolean;
  weight_hint: number;
}

export interface ParsedJobDescriptionData {
  title: string | null;
  seniority: string | null;
  employment_type: string | null;
  responsibilities: string[];
  requirements: string[];
  nice_to_have: string[];
  required_skills: ParsedJobSkill[];
  preferred_skills: ParsedJobSkill[];
  min_experience_years: number | null;
  education_requirement: string | null;
  domain_keywords: string[];
}

export interface ScoreCriterionConfig {
  criterion: string;
  weight: number;
}

export interface ScoreApplicationRequest {
  resume: ParsedResumeData;
  job_description: ParsedJobDescriptionData;
  config: {
    criteria: ScoreCriterionConfig[];
  };
}

export interface EvaluationCriterionResult {
  criterion: string;
  weight: number;
  score_normalized: number;
  reason: string;
  evidence: string[];
}

export interface EvaluationSkillResult {
  skill_name: string;
  normalized_skill_name: string;
  type: 'MATCHED' | 'MISSING' | 'PARTIAL';
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: string | null;
  note: string | null;
}

export interface EvaluationInterviewQuestion {
  question: string;
  category: string;
  linked_skill: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  rationale: string;
  display_order: number;
}

export interface EvaluationResult {
  overall_score: number;
  summary: string;
  criteria: EvaluationCriterionResult[];
  skills: EvaluationSkillResult[];
  explanation: string;
  skill_gap_summary: string;
  interview_questions: EvaluationInterviewQuestion[];
  evidence_map: Record<string, unknown>;
}
