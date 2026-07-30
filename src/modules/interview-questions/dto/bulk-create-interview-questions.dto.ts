// Body for POST /interview-questions/bulk — wraps a bounded array of CreateInterviewQuestionDto items.
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';

import { CreateInterviewQuestionDto } from './create-interview-question.dto';

export class BulkCreateInterviewQuestionsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateInterviewQuestionDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  items!: CreateInterviewQuestionDto[];
}
