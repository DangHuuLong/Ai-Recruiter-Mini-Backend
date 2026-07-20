import { describe, expect, it, jest } from '@jest/globals';
import { CriterionName } from '@prisma/client';

import { EvaluationConfigsService } from './evaluation-configs.service';
import { CreateEvaluationConfigDto } from './dto/create-evaluation-config.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const jobDescriptionFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const evaluationConfigFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const evaluationConfigDelete = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txUpdateMany = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const tx = { evaluationConfig: { create: txCreate, update: txUpdate, updateMany: txUpdateMany } };
  const $transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

  const prisma = {
    jobDescription: { findFirst: jobDescriptionFindFirst },
    evaluationConfig: { findFirst: evaluationConfigFindFirst, delete: evaluationConfigDelete },
    $transaction,
  } as unknown as PrismaService;

  return {
    prisma,
    jobDescriptionFindFirst,
    evaluationConfigFindFirst,
    evaluationConfigDelete,
    txCreate,
    txUpdate,
    txUpdateMany,
    $transaction,
  };
}

function validCriteria() {
  return [
    { criterion: CriterionName.SKILLS_MATCH, weight: 0.6 },
    { criterion: CriterionName.EXPERIENCE_RELEVANCE, weight: 0.4 },
  ];
}

describe('EvaluationConfigsService.create', () => {
  it('rejects criteria whose weights do not sum to 1.0', async () => {
    const { prisma, $transaction } = buildPrismaMock();
    const service = new EvaluationConfigsService(prisma);
    const dto = {
      name: 'Bad config',
      criteria: [{ criterion: CriterionName.SKILLS_MATCH, weight: 0.5 }],
    } as CreateEvaluationConfigDto;

    await expect(service.create(dto, 'org-1', 'user-1')).rejects.toThrow(AppException);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate criteria in the same config', async () => {
    const { prisma } = buildPrismaMock();
    const service = new EvaluationConfigsService(prisma);
    const dto = {
      name: 'Duplicate config',
      criteria: [
        { criterion: CriterionName.SKILLS_MATCH, weight: 0.5 },
        { criterion: CriterionName.SKILLS_MATCH, weight: 0.5 },
      ],
    } as CreateEvaluationConfigDto;

    await expect(service.create(dto, 'org-1', 'user-1')).rejects.toThrow(AppException);
  });

  it('throws 404 when jobDescriptionId does not belong to the organization', async () => {
    const { prisma, jobDescriptionFindFirst } = buildPrismaMock();
    jobDescriptionFindFirst.mockResolvedValue(null);
    const service = new EvaluationConfigsService(prisma);
    const dto = {
      name: 'Scoped config',
      jobDescriptionId: 'jd-other-org',
      criteria: validCriteria(),
    } as CreateEvaluationConfigDto;

    await expect(service.create(dto, 'org-1', 'user-1')).rejects.toThrow(AppException);
  });

  it('clears the existing default in the same scope when isDefault is true', async () => {
    const { prisma, txUpdateMany, txCreate } = buildPrismaMock();
    txCreate.mockResolvedValue({ id: 'config-2' });
    const service = new EvaluationConfigsService(prisma);
    const dto = {
      name: 'New default',
      isDefault: true,
      criteria: validCriteria(),
    } as CreateEvaluationConfigDto;

    await service.create(dto, 'org-1', 'user-1');

    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', jobDescriptionId: null, isDefault: true },
      data: { isDefault: false },
    });
    expect(txCreate).toHaveBeenCalled();
  });

  it('does not touch existing defaults when isDefault is false/omitted', async () => {
    const { prisma, txUpdateMany, txCreate } = buildPrismaMock();
    txCreate.mockResolvedValue({ id: 'config-1' });
    const service = new EvaluationConfigsService(prisma);
    const dto = { name: 'Non-default', criteria: validCriteria() } as CreateEvaluationConfigDto;

    await service.create(dto, 'org-1', 'user-1');

    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(txCreate).toHaveBeenCalled();
  });
});

describe('EvaluationConfigsService.remove', () => {
  it('throws 404 for a config outside the organization', async () => {
    const { prisma, evaluationConfigFindFirst } = buildPrismaMock();
    evaluationConfigFindFirst.mockResolvedValue(null);
    const service = new EvaluationConfigsService(prisma);

    await expect(service.remove('config-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('deletes an existing config and returns {id, deleted: true}', async () => {
    const { prisma, evaluationConfigFindFirst, evaluationConfigDelete } = buildPrismaMock();
    evaluationConfigFindFirst.mockResolvedValue({ id: 'config-1' });
    evaluationConfigDelete.mockResolvedValue({});
    const service = new EvaluationConfigsService(prisma);

    await expect(service.remove('config-1', 'org-1')).resolves.toEqual({
      id: 'config-1',
      deleted: true,
    });
  });
});
