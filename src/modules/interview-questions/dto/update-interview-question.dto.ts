// Body for PATCH /interview-questions/:id — all fields optional, mirrors CreateInterviewQuestionDto.
import {
  AssessmentTarget,
  AutonomyLevel,
  CompetencyType,
  ExperienceBucket,
  InterviewQuestionType,
  OccupationFamily,
  QuestionQualityGateStatus,
} from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInterviewQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  questionText?: string;

  @IsOptional()
  @IsEnum(OccupationFamily)
  occupationFamily?: OccupationFamily;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  specialization?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enablers?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(150)
  businessContext?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  competency?: string;

  @IsOptional()
  @IsEnum(CompetencyType)
  competencyType?: CompetencyType;

  @IsOptional()
  @IsEnum(AssessmentTarget)
  assessmentTarget?: AssessmentTarget;

  @IsOptional()
  @IsEnum(ExperienceBucket)
  experienceBucket?: ExperienceBucket;

  @IsOptional()
  @IsEnum(AutonomyLevel)
  autonomyLevel?: AutonomyLevel;

  @IsOptional()
  @IsEnum(InterviewQuestionType)
  questionType?: InterviewQuestionType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  rubric?: string[];

  @IsOptional()
  @IsEnum(QuestionQualityGateStatus)
  qualityGateStatus?: QuestionQualityGateStatus;
}
