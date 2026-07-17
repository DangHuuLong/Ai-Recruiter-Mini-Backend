import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  InterviewQuestionType,
  OccupationFamily,
  QuestionQualityGateStatus,
} from '@prisma/client';

export class InterviewQuestionQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(OccupationFamily)
  occupationFamily?: OccupationFamily;

  @IsOptional()
  @IsEnum(InterviewQuestionType)
  questionType?: InterviewQuestionType;

  @IsOptional()
  @IsEnum(QuestionQualityGateStatus)
  qualityGateStatus?: QuestionQualityGateStatus;
}
