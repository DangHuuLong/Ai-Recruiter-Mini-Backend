// Query params for filtering a scoring batch's skill-gap report by job description item.
import { IsOptional, IsString } from 'class-validator';

export class SkillGapQueryDto {
  @IsOptional()
  @IsString()
  jdItemId?: string;
}
