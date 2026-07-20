import { describe, expect, it, jest } from '@jest/globals';
import { UserRole } from '@prisma/client';

import { UsersService } from './users.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const count = jest.fn<(...args: unknown[]) => Promise<number>>();
  const update = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const prisma = { user: { findFirst, count, update } } as unknown as PrismaService;

  return { prisma, findFirst, count, update };
}

describe('UsersService.update', () => {
  it('throws 404 when the target user is not in the org', async () => {
    const { prisma, findFirst } = buildPrismaMock();
    findFirst.mockResolvedValue(null);
    const service = new UsersService(prisma);

    await expect(service.update('missing', {}, 'org-1', 'admin-1')).rejects.toThrow(AppException);
  });

  it('blocks a user from changing their own role', async () => {
    const { prisma, findFirst } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN });
    const service = new UsersService(prisma);

    await expect(
      service.update('admin-1', { role: UserRole.RECRUITER }, 'org-1', 'admin-1'),
    ).rejects.toThrow(AppException);
  });

  it('blocks a user from deactivating their own account', async () => {
    const { prisma, findFirst } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN });
    const service = new UsersService(prisma);

    await expect(
      service.update('admin-1', { isActive: false }, 'org-1', 'admin-1'),
    ).rejects.toThrow(AppException);
  });

  it('allows a user to change their own fullName', async () => {
    const { prisma, findFirst, update } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN });
    update.mockResolvedValue({ id: 'admin-1', fullName: 'New Name' });
    const service = new UsersService(prisma);

    await expect(
      service.update('admin-1', { fullName: 'New Name' }, 'org-1', 'admin-1'),
    ).resolves.toEqual({ id: 'admin-1', fullName: 'New Name' });
  });

  it('blocks demoting the last active admin', async () => {
    const { prisma, findFirst, count } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'admin-2', role: UserRole.ADMIN });
    count.mockResolvedValue(0);
    const service = new UsersService(prisma);

    await expect(
      service.update('admin-2', { role: UserRole.RECRUITER }, 'org-1', 'admin-1'),
    ).rejects.toThrow(AppException);
  });

  it('blocks deactivating the last active admin', async () => {
    const { prisma, findFirst, count } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'admin-2', role: UserRole.ADMIN });
    count.mockResolvedValue(0);
    const service = new UsersService(prisma);

    await expect(
      service.update('admin-2', { isActive: false }, 'org-1', 'admin-1'),
    ).rejects.toThrow(AppException);
  });

  it('allows demoting an admin when another active admin remains', async () => {
    const { prisma, findFirst, count, update } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'admin-2', role: UserRole.ADMIN });
    count.mockResolvedValue(1);
    update.mockResolvedValue({ id: 'admin-2', role: UserRole.RECRUITER });
    const service = new UsersService(prisma);

    await expect(
      service.update('admin-2', { role: UserRole.RECRUITER }, 'org-1', 'admin-1'),
    ).resolves.toEqual({ id: 'admin-2', role: UserRole.RECRUITER });
  });

  it('does not run the last-admin check for a non-admin target', async () => {
    const { prisma, findFirst, count, update } = buildPrismaMock();
    findFirst.mockResolvedValue({ id: 'recruiter-1', role: UserRole.RECRUITER });
    update.mockResolvedValue({ id: 'recruiter-1', isActive: false });
    const service = new UsersService(prisma);

    await expect(
      service.update('recruiter-1', { isActive: false }, 'org-1', 'admin-1'),
    ).resolves.toEqual({ id: 'recruiter-1', isActive: false });
    expect(count).not.toHaveBeenCalled();
  });
});
