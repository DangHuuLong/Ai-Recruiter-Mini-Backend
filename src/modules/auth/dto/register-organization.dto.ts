// Body for POST /auth/register-organization — creates a new organization and its first admin user.
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  organizationName!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  adminFullName?: string;

  @IsEmail()
  @MaxLength(255)
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  adminPassword!: string;
}
