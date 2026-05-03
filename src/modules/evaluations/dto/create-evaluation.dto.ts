import { IsOptional, IsString } from 'class-validator';

export class CreateEvaluationDto {
  @IsString()
  applicationId!: string;

  @IsOptional()
  @IsString()
  configId?: string;

  @IsOptional()
  @IsString()
  createdById?: string;
}
