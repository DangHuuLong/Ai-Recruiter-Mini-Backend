import { describe, expect, it, jest } from '@jest/globals';

import { CandidatesService } from './candidates.service';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const findUnique = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const del = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const prisma = { candidate: { findFirst, findUnique, delete: del } } as unknown as PrismaService;

  return { prisma, findFirst, findUnique, del };
}

describe('CandidatesService.removeMany', () => {
  it('reports success for a deletable candidate, 409 for one with related records, and 404 for a missing one', async () => {
    const { prisma, findFirst, findUnique, del } = buildPrismaMock();

    findFirst.mockImplementation(async (...args: unknown[]) => {
      const { where } = args[0] as { where: { id: string } };
      if (where.id === 'missing') return null;
      return { id: where.id };
    });
    findUnique.mockImplementation(async (...args: unknown[]) => {
      const { where } = args[0] as { where: { id: string } };
      if (where.id === 'blocked') return { _count: { resumes: 1, applications: 0 } };
      return { _count: { resumes: 0, applications: 0 } };
    });
    del.mockResolvedValue(undefined);

    const service = new CandidatesService(prisma);
    const results = await service.removeMany(['clean', 'blocked', 'missing'], 'org-1');

    expect(results).toEqual([
      { id: 'clean', success: true, data: { id: 'clean', deleted: true } },
      { id: 'blocked', success: false, error: 'Candidate has related resumes or applications and cannot be deleted' },
      { id: 'missing', success: false, error: 'Candidate not found' },
    ]);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith({ where: { id: 'clean' } });
  });

  it('processes every id even when earlier ones fail (no short-circuiting)', async () => {
    const { prisma, findFirst, findUnique, del } = buildPrismaMock();

    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(null);
    del.mockResolvedValue(undefined);

    const service = new CandidatesService(prisma);
    const results = await service.removeMany(['a', 'b', 'c'], 'org-1');

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success === false)).toBe(true);
    expect(del).not.toHaveBeenCalled();
  });
});
