import { Type } from 'class-transformer';
import { ArrayMinSize, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { CriterionDefinitionDto } from './criterion-definition.dto';

export class CreateEvaluationConfigDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  jobDescriptionId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string;

  @ValidateNested({ each: true })
  @Type(() => CriterionDefinitionDto)
  @ArrayMinSize(1)
  criteria!: CriterionDefinitionDto[];
}
