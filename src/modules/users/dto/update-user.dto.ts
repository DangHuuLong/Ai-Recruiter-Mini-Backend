// Body for PATCH /users/:id — partial update of a user's name, role, or active status.
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { ORG_ASSIGNABLE_ROLES, type OrgAssignableRole } from '../../../common/constants/org-assignable-roles';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsIn(ORG_ASSIGNABLE_ROLES)
  role?: OrgAssignableRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
