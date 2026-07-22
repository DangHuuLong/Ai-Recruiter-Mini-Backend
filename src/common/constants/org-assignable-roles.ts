// Roles assignable through the org-facing Users API (POST/PATCH /users). DEV is intentionally
// excluded — it's a platform-owner role, not scoped to any organization, and must never be
// grantable by a tenant admin.
import { UserRole } from '@prisma/client';

export const ORG_ASSIGNABLE_ROLES = [
  UserRole.ADMIN,
  UserRole.RECRUITER,
  UserRole.HIRING_MANAGER,
] as const;

export type OrgAssignableRole = (typeof ORG_ASSIGNABLE_ROLES)[number];
