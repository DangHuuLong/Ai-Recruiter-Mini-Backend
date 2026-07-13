import { UserRole } from '@prisma/client';

export type AuthUser = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

export type JwtPayload = {
  sub: string;
  organizationId: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
};
