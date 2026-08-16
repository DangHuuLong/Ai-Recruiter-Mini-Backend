import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AppException } from '../../common/exceptions/app.exception';
import { hashPassword } from '../../common/utils/password.util';
import { verifyJwt } from '../../common/utils/jwt.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UsersService } from '../users/users.service';

function buildPrismaMock() {
  const userFindUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const userUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const orgFindUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const orgCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txUserCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      organization: { create: orgCreate },
      user: { create: txUserCreate },
    }),
  );

  const prisma = {
    user: { findUnique: userFindUnique, update: userUpdate },
    organization: { findUnique: orgFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;

  return { prisma, userFindUnique, userUpdate, orgFindUnique, orgCreate, txUserCreate, transaction };
}

function buildUsersServiceMock() {
  const findActiveByEmail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const usersService = { findActiveByEmail } as unknown as UsersService;
  return { usersService, findActiveByEmail };
}

function buildAuthTokenServiceMock() {
  const issueEmailVerificationToken = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const issuePasswordResetToken = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const consumeToken = jest.fn<(...args: unknown[]) => Promise<string | null>>();
  const authTokenService = {
    issueEmailVerificationToken,
    issuePasswordResetToken,
    consumeToken,
  } as unknown as AuthTokenService;

  return { authTokenService, issueEmailVerificationToken, issuePasswordResetToken, consumeToken };
}

function buildConfigServiceMock() {
  const getOrThrow = jest.fn().mockReturnValue('test-jwt-secret');
  const get = jest.fn().mockReturnValue(undefined);
  const configService = { getOrThrow, get } as unknown as ConfigService;
  return { configService, getOrThrow, get };
}

function buildService(overrides?: {
  prismaMock?: ReturnType<typeof buildPrismaMock>;
  usersMock?: ReturnType<typeof buildUsersServiceMock>;
  tokenMock?: ReturnType<typeof buildAuthTokenServiceMock>;
  configMock?: ReturnType<typeof buildConfigServiceMock>;
}) {
  const prismaMock = overrides?.prismaMock ?? buildPrismaMock();
  const usersMock = overrides?.usersMock ?? buildUsersServiceMock();
  const tokenMock = overrides?.tokenMock ?? buildAuthTokenServiceMock();
  const configMock = overrides?.configMock ?? buildConfigServiceMock();

  const service = new AuthService(
    configMock.configService,
    usersMock.usersService,
    prismaMock.prisma,
    tokenMock.authTokenService,
  );

  return { service, prismaMock, usersMock, tokenMock, configMock };
}

const ACTIVE_USER = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  role: UserRole.ADMIN,
  isActive: true,
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('AuthService.login', () => {
  it('throws 401 when no active user matches the email', async () => {
    const { service, usersMock } = buildService();
    usersMock.findActiveByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'nobody@example.com', password: 'password123' }),
    ).rejects.toThrow(AppException);
  });

  it('throws 401 when the password does not match the stored hash', async () => {
    const { service, usersMock } = buildService();
    const passwordHash = await hashPassword('correct-password');
    usersMock.findActiveByEmail.mockResolvedValue({ ...ACTIVE_USER, passwordHash });

    await expect(
      service.login({ email: ACTIVE_USER.email, password: 'wrong-password' }),
    ).rejects.toThrow(AppException);
  });

  it('throws 403 when the email has not been verified yet', async () => {
    const { service, usersMock } = buildService();
    const passwordHash = await hashPassword('correct-password');
    usersMock.findActiveByEmail.mockResolvedValue({
      ...ACTIVE_USER,
      passwordHash,
      emailVerifiedAt: null,
    });

    await expect(
      service.login({ email: ACTIVE_USER.email, password: 'correct-password' }),
    ).rejects.toThrow(AppException);
  });

  it('issues a valid session on correct credentials', async () => {
    const { service, usersMock } = buildService();
    const passwordHash = await hashPassword('correct-password');
    usersMock.findActiveByEmail.mockResolvedValue({ ...ACTIVE_USER, passwordHash });

    const session = await service.login({ email: ACTIVE_USER.email, password: 'correct-password' });

    expect(session.tokenType).toBe('Bearer');
    expect(session.user).toEqual({
      id: ACTIVE_USER.id,
      organizationId: ACTIVE_USER.organizationId,
      email: ACTIVE_USER.email,
      fullName: ACTIVE_USER.fullName,
      role: ACTIVE_USER.role,
    });
    const decoded = verifyJwt(session.accessToken, 'test-jwt-secret');
    expect(decoded?.sub).toBe(ACTIVE_USER.id);
    expect(decoded?.organizationId).toBe(ACTIVE_USER.organizationId);
  });
});

describe('AuthService.registerOrganization', () => {
  const BASE_DTO = {
    organizationName: 'Acme Inc',
    adminFullName: 'Jane Doe',
    adminEmail: 'jane@acme.com',
    adminPassword: 'password123',
  };

  it('throws 409 when the admin email is already registered', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.userFindUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(service.registerOrganization(BASE_DTO)).rejects.toThrow(AppException);
    expect(prismaMock.transaction).not.toHaveBeenCalled();
  });

  it('creates the organization + admin user and triggers a verification email, without issuing a session', async () => {
    const { service, prismaMock, tokenMock } = buildService();
    prismaMock.userFindUnique.mockResolvedValue(null);
    prismaMock.orgFindUnique.mockResolvedValue(null);
    prismaMock.orgCreate.mockResolvedValue({ id: 'org-1', slug: 'acme-inc' });
    prismaMock.txUserCreate.mockResolvedValue({ id: 'user-1', email: 'jane@acme.com' });

    const result = await service.registerOrganization(BASE_DTO);

    expect(result).toEqual({
      organizationId: 'org-1',
      organizationSlug: 'acme-inc',
      message: expect.any(String),
    });
    expect(result).not.toHaveProperty('accessToken');
    expect(tokenMock.issueEmailVerificationToken).toHaveBeenCalledWith(
      'user-1',
      'jane@acme.com',
      undefined,
    );
    expect(prismaMock.txUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN' }) }),
    );
  });

  it('appends a numeric suffix to the slug when the base slug is already taken', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.userFindUnique.mockResolvedValue(null);
    prismaMock.orgFindUnique
      .mockResolvedValueOnce({ id: 'taken' }) // "acme-inc" already exists
      .mockResolvedValueOnce(null); // "acme-inc-2" is free
    prismaMock.orgCreate.mockResolvedValue({ id: 'org-2', slug: 'acme-inc-2' });
    prismaMock.txUserCreate.mockResolvedValue({ id: 'user-2', email: 'jane@acme.com' });

    const result = await service.registerOrganization(BASE_DTO);

    expect(result.organizationSlug).toBe('acme-inc-2');
    expect(prismaMock.orgCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'acme-inc-2' }) }),
    );
  });
});

describe('AuthService.verifyEmail', () => {
  it('throws 400 when the token is invalid or expired', async () => {
    const { service, tokenMock } = buildService();
    tokenMock.consumeToken.mockResolvedValue(null);

    await expect(service.verifyEmail({ token: 'bad-token-1234567890' })).rejects.toThrow(AppException);
  });

  it('marks the user verified and issues a session on a valid token', async () => {
    const { service, tokenMock, prismaMock } = buildService();
    tokenMock.consumeToken.mockResolvedValue('user-1');
    prismaMock.userUpdate.mockResolvedValue(ACTIVE_USER);

    const session = await service.verifyEmail({ token: 'good-token-1234567890' });

    expect(prismaMock.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      }),
    );
    expect(session.accessToken).toEqual(expect.any(String));
  });
});

describe('AuthService.resendVerification', () => {
  it('returns a generic message and issues nothing when the account does not exist', async () => {
    const { service, usersMock, tokenMock } = buildService();
    usersMock.findActiveByEmail.mockResolvedValue(null);

    const result = await service.resendVerification({ email: 'nobody@example.com' });

    expect(result.message).toEqual(expect.any(String));
    expect(tokenMock.issueEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('does not re-issue a token when the account is already verified', async () => {
    const { service, usersMock, tokenMock } = buildService();
    usersMock.findActiveByEmail.mockResolvedValue(ACTIVE_USER);

    await service.resendVerification({ email: ACTIVE_USER.email });

    expect(tokenMock.issueEmailVerificationToken).not.toHaveBeenCalled();
  });

  it('issues a new verification token when the account exists and is not verified', async () => {
    const { service, usersMock, tokenMock } = buildService();
    usersMock.findActiveByEmail.mockResolvedValue({ ...ACTIVE_USER, emailVerifiedAt: null });

    await service.resendVerification({ email: ACTIVE_USER.email });

    expect(tokenMock.issueEmailVerificationToken).toHaveBeenCalledWith(
      ACTIVE_USER.id,
      ACTIVE_USER.email,
      ACTIVE_USER.fullName,
    );
  });
});

describe('AuthService.forgotPassword', () => {
  it('returns a generic message and issues nothing when the account does not exist', async () => {
    const { service, usersMock, tokenMock } = buildService();
    usersMock.findActiveByEmail.mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'nobody@example.com' });

    expect(result.message).toEqual(expect.any(String));
    expect(tokenMock.issuePasswordResetToken).not.toHaveBeenCalled();
  });

  it('issues a password reset token when the account exists', async () => {
    const { service, usersMock, tokenMock } = buildService();
    usersMock.findActiveByEmail.mockResolvedValue(ACTIVE_USER);

    await service.forgotPassword({ email: ACTIVE_USER.email });

    expect(tokenMock.issuePasswordResetToken).toHaveBeenCalledWith(
      ACTIVE_USER.id,
      ACTIVE_USER.email,
      ACTIVE_USER.fullName,
    );
  });
});

describe('AuthService.resetPassword', () => {
  it('throws 400 when the token is invalid or expired', async () => {
    const { service, tokenMock } = buildService();
    tokenMock.consumeToken.mockResolvedValue(null);

    await expect(
      service.resetPassword({ token: 'bad-token-1234567890', newPassword: 'new-password123' }),
    ).rejects.toThrow(AppException);
  });

  it('updates the password hash on a valid token', async () => {
    const { service, tokenMock, prismaMock } = buildService();
    tokenMock.consumeToken.mockResolvedValue('user-1');
    prismaMock.userUpdate.mockResolvedValue({ id: 'user-1' });

    const result = await service.resetPassword({
      token: 'good-token-1234567890',
      newPassword: 'new-password123',
    });

    expect(result.message).toEqual(expect.any(String));
    expect(prismaMock.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
  });
});
