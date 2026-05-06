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

export interface ParseResumeRequest {
  resume_id: string;
  file_name: string;
  file_type: string;
  signed_url: string;
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
}

export interface ParsedResumeData {
  personal: ParsedResumePersonalData;
  summary: string | null;
  skills: ParsedResumeSkill[];
  education: unknown[];
  experience: unknown[];
  projects: unknown[];
  certifications: unknown[];
  achievements: unknown[];
  languages: unknown[];
}

export interface ParseResumeResult {
  raw_text: string;
  parsed_data: ParsedResumeData;
  parser_version: string;
  warnings: string[];
  confidence: number | null;
  text_extraction_method: string;
}

export interface ParseJobDescriptionRequest {
  raw_text: string;
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
