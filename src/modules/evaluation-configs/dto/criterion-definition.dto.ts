import { CriterionName } from '@prisma/client';
import { IsEnum, IsNumber, Max, Min } from 'class-validator';

export class CriterionDefinitionDto {
  @IsEnum(CriterionName)
  criterion!: CriterionName;

  @IsNumber()
  @Min(0)
  @Max(1)
  weight!: number;
}
