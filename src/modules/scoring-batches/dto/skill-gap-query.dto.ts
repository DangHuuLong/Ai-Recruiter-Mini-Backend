import { IsOptional, IsString } from 'class-validator';

export class SkillGapQueryDto {
  @IsOptional()
  @IsString()
  jdItemId?: string;
}
