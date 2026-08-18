import { describe, expect, it, jest } from '@jest/globals';

import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const findMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const count = jest.fn<(...args: unknown[]) => Promise<number>>();

  const transaction = jest.fn(async (arg: unknown) => Promise.all(arg as unknown[]));

  const prisma = {
    auditLog: { findMany, count },
    $transaction: transaction,
  } as unknown as PrismaService;

  return { prisma, findMany, count };
}

describe('AuditLogsService.findAll', () => {
  it('always scopes the query to the caller organization, with no optional filters by default', async () => {
    const { prisma, findMany, count } = buildPrismaMock();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const service = new AuditLogsService(prisma);

    await service.findAll({ page: 1, limit: 20 } as never, 'org-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('adds resourceType/resourceId/actorUserId to the filter only when provided', async () => {
    const { prisma, findMany, count } = buildPrismaMock();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const service = new AuditLogsService(prisma);

    await service.findAll(
      { page: 1, limit: 20, resourceType: 'Candidate', actorUserId: 'user-1' } as never,
      'org-1',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', resourceType: 'Candidate', actorUserId: 'user-1' },
      }),
    );
  });

  it('computes pagination meta from the total count and page size', async () => {
    const { prisma, findMany, count } = buildPrismaMock();
    findMany.mockResolvedValue([{ id: 'log-1' }]);
    count.mockResolvedValue(45);
    const service = new AuditLogsService(prisma);

    const result = await service.findAll({ page: 2, limit: 20 } as never, 'org-1');

    expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });
});
