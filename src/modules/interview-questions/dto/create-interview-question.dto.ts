// Body for POST /interview-questions — full field set for manually authoring an InterviewQuestionEntry.
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

  @IsOptional()
  @IsEnum(QuestionQualityGateStatus)
  qualityGateStatus?: QuestionQualityGateStatus;
}
