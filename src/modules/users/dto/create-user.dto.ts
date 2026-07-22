// Body for POST /users — creates a new user account within the current organization.
import { UserRole } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ORG_ASSIGNABLE_ROLES, type OrgAssignableRole } from '../../../common/constants/org-assignable-roles';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsIn(ORG_ASSIGNABLE_ROLES)
  role: OrgAssignableRole = UserRole.RECRUITER;
}
