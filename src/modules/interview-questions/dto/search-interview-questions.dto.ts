// Body for POST /interview-questions/search(-or-generate) — semantic query text plus hard filters and result limit.
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { OccupationFamily } from '@prisma/client';

export class SearchInterviewQuestionsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  queryText!: string;

  @IsEnum(OccupationFamily)
  occupationFamily!: OccupationFamily;

  @IsString()
  @MaxLength(150)
  specialization!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enablers?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 5;
}
