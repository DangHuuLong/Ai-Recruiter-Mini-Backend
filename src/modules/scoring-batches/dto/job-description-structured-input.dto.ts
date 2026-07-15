import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class JobDescriptionStructuredSkillDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isCore?: boolean;

  @IsOptional()
  @IsInt()
  weightHint?: number;
}

export class JobDescriptionStructuredInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  seniority?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employmentType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  niceToHave?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobDescriptionStructuredSkillDto)
  @ArrayMaxSize(100)
  requiredSkills?: JobDescriptionStructuredSkillDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => JobDescriptionStructuredSkillDto)
  @ArrayMaxSize(100)
  preferredSkills?: JobDescriptionStructuredSkillDto[];

  @IsOptional()
  @IsInt()
  minExperienceYears?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  educationRequirement?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domainKeywords?: string[];
}
