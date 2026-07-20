import { describe, expect, it, jest } from '@jest/globals';
import { OccupationFamily } from '@prisma/client';

import { JobDescriptionsService } from './job-descriptions.service';
import { UpdateJobDescriptionDto } from './dto/update-job-description.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { AiService } from '../../integrations/ai/ai.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { JobDescriptionClassifierService } from './job-description-classifier.service';
import { JobSkillsService } from './job-skills.service';

function buildService() {
  const findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const update = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  findFirst.mockResolvedValue({ id: 'jd-1', isActive: true });
  update.mockImplementation(async (...args: unknown[]) => (args[0] as { data: unknown }).data);

  const prisma = {
    jobDescription: { findFirst, update },
  } as unknown as PrismaService;

  const service = new JobDescriptionsService(
    prisma,
    {} as AiService,
    {} as JobSkillsService,
    {} as JobDescriptionClassifierService,
  );

  return { service, findFirst, update };
}

describe('JobDescriptionsService.update — taxonomy validation', () => {
  it('allows an update with neither occupationFamily nor specialization', async () => {
    const { service } = buildService();

    await expect(
      service.update('jd-1', { title: 'New title' } as UpdateJobDescriptionDto, 'org-1'),
    ).resolves.toBeDefined();
  });

  it('rejects occupationFamily without specialization', async () => {
    const { service } = buildService();

    await expect(
      service.update(
        'jd-1',
        { occupationFamily: OccupationFamily.IT } as UpdateJobDescriptionDto,
        'org-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('rejects specialization without occupationFamily', async () => {
    const { service } = buildService();

    await expect(
      service.update('jd-1', { specialization: 'Backend' } as UpdateJobDescriptionDto, 'org-1'),
    ).rejects.toThrow(AppException);
  });

  it('rejects a specialization that does not belong to the given occupationFamily', async () => {
    const { service } = buildService();

    await expect(
      service.update(
        'jd-1',
        { occupationFamily: OccupationFamily.IT, specialization: 'Not A Real Specialization' } as UpdateJobDescriptionDto,
        'org-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('accepts a valid occupationFamily/specialization pair', async () => {
    const { service, update } = buildService();

    await service.update(
      'jd-1',
      { occupationFamily: OccupationFamily.IT, specialization: 'Backend' } as UpdateJobDescriptionDto,
      'org-1',
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jd-1' },
        data: expect.objectContaining({
          occupationFamily: OccupationFamily.IT,
          specialization: 'Backend',
        }),
      }),
    );
  });
});
