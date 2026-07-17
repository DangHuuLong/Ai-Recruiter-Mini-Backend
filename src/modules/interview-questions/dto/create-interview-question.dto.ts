import {
  AssessmentTarget,
  AutonomyLevel,
  CompetencyType,
  ExperienceBucket,
  InterviewQuestionSource,
  InterviewQuestionType,
  OccupationFamily,
  QuestionQualityGateStatus,
} from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateInterviewQuestionDto {
  @IsString()
  @MaxLength(2000)
  questionText!: string;

  @IsEnum(OccupationFamily)
  occupationFamily!: OccupationFamily;

  @IsString()
  @MaxLength(150)
  specialization!: string;

  @IsArray()
  @IsString({ each: true })
  enablers!: string[];

  @IsString()
  @MaxLength(150)
  businessContext!: string;

  @IsString()
  @MaxLength(150)
  competency!: string;

  @IsEnum(CompetencyType)
  competencyType!: CompetencyType;

  @IsEnum(AssessmentTarget)
  assessmentTarget!: AssessmentTarget;

  @IsEnum(ExperienceBucket)
  experienceBucket!: ExperienceBucket;

  @IsEnum(AutonomyLevel)
  autonomyLevel!: AutonomyLevel;

  @IsEnum(InterviewQuestionType)
  questionType!: InterviewQuestionType;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  rubric!: string[];

  @IsOptional()
  @IsEnum(InterviewQuestionSource)
  source?: InterviewQuestionSource;

  // Only reachable by the DEV role — a human has already reviewed the
  // content by typing it in, so this defaults to APPROVED in the service
  // (unlike the future AI-fallback write-back path, which must start at
  // PENDING_REVIEW). Exposed here only so DEV can override if needed.
  @IsOptional()
  @IsEnum(QuestionQualityGateStatus)
  qualityGateStatus?: QuestionQualityGateStatus;
}
