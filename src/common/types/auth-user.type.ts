// Shape of the authenticated user attached to a request, and the JWT payload it's derived from.
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
