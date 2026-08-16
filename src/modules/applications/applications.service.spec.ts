import { describe, expect, it, jest } from '@jest/globals';

import { ApplicationsService } from './applications.service';
import { AppException } from '../../common/exceptions/app.exception';
import { ApplicationStatusEnum } from '../../common/enums';
import { PrismaService } from '../../database/prisma/prisma.service';

function buildPrismaMock() {
  const candidateFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const resumeFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const jobDescriptionFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const applicationFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const applicationUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const txApplicationCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txApplicationEventCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const txApplicationUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  // Mirrors both $transaction call styles used in this service: an array of already-invoked
  // Promises (validateApplicationRelations/findAll) and a callback receiving a `tx` handle
  // (create/updateStatus).
  const transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => Promise<unknown>)({
        application: { create: txApplicationCreate, update: txApplicationUpdate },
        applicationEvent: { create: txApplicationEventCreate },
      });
    }
    return Promise.all(arg as unknown[]);
  });

  const prisma = {
    candidate: { findFirst: candidateFindFirst },
    resume: { findFirst: resumeFindFirst },
    jobDescription: { findFirst: jobDescriptionFindFirst },
    application: { findFirst: applicationFindFirst, update: applicationUpdate },
    $transaction: transaction,
  } as unknown as PrismaService;

  return {
    prisma,
    candidateFindFirst,
    resumeFindFirst,
    jobDescriptionFindFirst,
    applicationFindFirst,
    applicationUpdate,
    txApplicationCreate,
    txApplicationEventCreate,
    txApplicationUpdate,
    transaction,
  };
}

const CREATE_DTO = { candidateId: 'candidate-1', resumeId: 'resume-1', jobDescriptionId: 'jd-1' };

describe('ApplicationsService.create', () => {
  it('throws 404 when the candidate is not in the organization', async () => {
    const { prisma, candidateFindFirst, resumeFindFirst, jobDescriptionFindFirst } = buildPrismaMock();
    candidateFindFirst.mockResolvedValue(null);
    resumeFindFirst.mockResolvedValue({ id: 'resume-1', candidateId: 'candidate-1' });
    jobDescriptionFindFirst.mockResolvedValue({ id: 'jd-1', isActive: true });
    const service = new ApplicationsService(prisma);

    await expect(service.create(CREATE_DTO, 'user-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('throws 409 when the resume belongs to a different candidate', async () => {
    const { prisma, candidateFindFirst, resumeFindFirst, jobDescriptionFindFirst } = buildPrismaMock();
    candidateFindFirst.mockResolvedValue({ id: 'candidate-1' });
    resumeFindFirst.mockResolvedValue({ id: 'resume-1', candidateId: 'someone-else' });
    jobDescriptionFindFirst.mockResolvedValue({ id: 'jd-1', isActive: true });
    const service = new ApplicationsService(prisma);

    await expect(service.create(CREATE_DTO, 'user-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('throws 409 when the job description is not active', async () => {
    const { prisma, candidateFindFirst, resumeFindFirst, jobDescriptionFindFirst } = buildPrismaMock();
    candidateFindFirst.mockResolvedValue({ id: 'candidate-1' });
    resumeFindFirst.mockResolvedValue({ id: 'resume-1', candidateId: 'candidate-1' });
    jobDescriptionFindFirst.mockResolvedValue({ id: 'jd-1', isActive: false });
    const service = new ApplicationsService(prisma);

    await expect(service.create(CREATE_DTO, 'user-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('creates the application and a CREATED event in one transaction on valid relations', async () => {
    const {
      prisma,
      candidateFindFirst,
      resumeFindFirst,
      jobDescriptionFindFirst,
      txApplicationCreate,
      txApplicationEventCreate,
    } = buildPrismaMock();
    candidateFindFirst.mockResolvedValue({ id: 'candidate-1' });
    resumeFindFirst.mockResolvedValue({ id: 'resume-1', candidateId: 'candidate-1' });
    jobDescriptionFindFirst.mockResolvedValue({ id: 'jd-1', isActive: true });
    txApplicationCreate.mockResolvedValue({
      id: 'app-1',
      status: 'APPLIED',
      candidateId: 'candidate-1',
      resumeId: 'resume-1',
      jobDescriptionId: 'jd-1',
    });
    const service = new ApplicationsService(prisma);

    const result = await service.create(CREATE_DTO, 'user-1', 'org-1');

    expect(result).toEqual(
      expect.objectContaining({ id: 'app-1' }),
    );
    expect(txApplicationEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: 'app-1',
          eventType: 'APPLICATION_CREATED',
        }),
      }),
    );
  });
});

describe('ApplicationsService.updateStatus', () => {
  it('is a no-op (no transaction, no event) when the status is unchanged', async () => {
    const { prisma, applicationFindFirst, transaction } = buildPrismaMock();
    applicationFindFirst.mockResolvedValue({ id: 'app-1', status: 'APPLIED' });
    const service = new ApplicationsService(prisma);
    transaction.mockClear();

    await service.updateStatus('app-1', { status: ApplicationStatusEnum.APPLIED }, 'org-1');

    expect(transaction).not.toHaveBeenCalled();
    // findOne() re-queries directly, not through $transaction.
    expect(applicationFindFirst).toHaveBeenCalledTimes(2);
  });

  it('transitions status and records a STATUS_CHANGED event with from/to/note', async () => {
    const { prisma, applicationFindFirst, txApplicationUpdate, txApplicationEventCreate } =
      buildPrismaMock();
    applicationFindFirst.mockResolvedValue({ id: 'app-1', status: 'APPLIED' });
    txApplicationUpdate.mockResolvedValue({ id: 'app-1', status: 'SCREENING' });
    const service = new ApplicationsService(prisma);

    const result = await service.updateStatus(
      'app-1',
      { status: ApplicationStatusEnum.SCREENING, note: 'looks strong' },
      'org-1',
    );

    expect(result).toEqual({ id: 'app-1', status: 'SCREENING' });
    expect(txApplicationEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'STATUS_CHANGED',
          eventData: { fromStatus: 'APPLIED', toStatus: 'SCREENING', note: 'looks strong' },
        }),
      }),
    );
  });

  it('throws 404 when the application does not exist in the organization', async () => {
    const { prisma, applicationFindFirst } = buildPrismaMock();
    applicationFindFirst.mockResolvedValue(null);
    const service = new ApplicationsService(prisma);

    await expect(
      service.updateStatus('missing', { status: ApplicationStatusEnum.SCREENING }, 'org-1'),
    ).rejects.toThrow(AppException);
  });
});

describe('ApplicationsService.findByCandidateId', () => {
  it('throws 404 when the candidate is not in the organization', async () => {
    const { prisma, candidateFindFirst } = buildPrismaMock();
    candidateFindFirst.mockResolvedValue(null);
    const service = new ApplicationsService(prisma);

    await expect(service.findByCandidateId('candidate-1', 'org-1')).rejects.toThrow(AppException);
  });
});
