// Structured (pre-parsed) resume input for a scoring batch, covering personal info, skills, education, experience, and more.
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ResumeStructuredPersonalDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  githubUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  portfolioUrl?: string;
}

export class ResumeStructuredSkillDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidence?: string;
}

export class ResumeStructuredEducationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  degree?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fieldOfStudy?: string;

  @IsOptional()
  @IsInt()
  startYear?: number;

  @IsOptional()
  @IsInt()
  endYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gpa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gpaScale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class ResumeStructuredExperienceDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate?: string;

  @IsOptional()
  @IsInt()
  durationMonths?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  responsibilities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];
}

export class ResumeStructuredProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  urls?: string[];
}

export class ResumeStructuredCertificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  issuer?: string;

  @IsOptional()
  @IsInt()
  issuedYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

export class ResumeStructuredAchievementDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  year?: number;
}

export class ResumeStructuredLanguageDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  proficiency?: string;
}

export class ResumeStructuredInputDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ResumeStructuredPersonalDto)
  personal?: ResumeStructuredPersonalDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredSkillDto)
  @ArrayMaxSize(200)
  skills?: ResumeStructuredSkillDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredEducationDto)
  @ArrayMaxSize(50)
  education?: ResumeStructuredEducationDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredExperienceDto)
  @ArrayMaxSize(50)
  experience?: ResumeStructuredExperienceDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredProjectDto)
  @ArrayMaxSize(50)
  projects?: ResumeStructuredProjectDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredCertificationDto)
  @ArrayMaxSize(50)
  certifications?: ResumeStructuredCertificationDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredAchievementDto)
  @ArrayMaxSize(50)
  achievements?: ResumeStructuredAchievementDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ResumeStructuredLanguageDto)
  @ArrayMaxSize(50)
  languages?: ResumeStructuredLanguageDto[];
}
