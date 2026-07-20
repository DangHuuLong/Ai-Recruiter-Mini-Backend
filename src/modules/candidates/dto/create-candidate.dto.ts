// Body for POST /candidates — candidate profile fields (name, contact, links, location).
import { IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  primaryEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  primaryPhone?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  linkedinUrl?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  githubUrl?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  portfolioUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
