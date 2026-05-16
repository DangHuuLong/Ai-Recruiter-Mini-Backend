import { UserRole } from '@prisma/client';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
};

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
};
