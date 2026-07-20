import { describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from './roles.guard';
import { AppException } from '../exceptions/app.exception';
import { AuthUser } from '../types/auth-user.type';

function buildContext(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows the request through when the route has no @Roles() metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('throws 401 when no user is on the request but roles are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(AppException);
  });

  it('throws 403 when the user role is not in the allowed list', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user = { id: '1', organizationId: 'org1', email: 'a@b.com', fullName: null, role: UserRole.RECRUITER };

    expect(() => guard.canActivate(buildContext(user))).toThrow(AppException);
  });

  it('allows the request through when the user role is in the allowed list', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN, UserRole.RECRUITER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const user = { id: '1', organizationId: 'org1', email: 'a@b.com', fullName: null, role: UserRole.RECRUITER };

    expect(guard.canActivate(buildContext(user))).toBe(true);
  });
});
