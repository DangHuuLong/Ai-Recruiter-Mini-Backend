import { describe, expect, it, jest } from '@jest/globals';

import { ResumesService } from './resumes.service';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiService } from '../../integrations/ai/ai.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

function buildPrismaMock() {
  const candidateFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const candidateUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const fileAssetFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const resumeFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const resumeCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const resumeUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const resumeDelete = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const applicationCount = jest.fn<(...args: unknown[]) => Promise<number>>();

  const prisma = {
    candidate: { findFirst: candidateFindFirst, update: candidateUpdate },
    fileAsset: { findFirst: fileAssetFindFirst },
    resume: { findFirst: resumeFindFirst, create: resumeCreate, update: resumeUpdate, delete: resumeDelete },
    application: { count: applicationCount },
  } as unknown as PrismaService;

  return {
    prisma,
    candidateFindFirst,
    candidateUpdate,
    fileAssetFindFirst,
    resumeFindFirst,
    resumeCreate,
    resumeUpdate,
    resumeDelete,
    applicationCount,
  };
}

function buildAiServiceMock() {
  const parseResume = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const aiService = { parseResume } as unknown as AiService;
  return { aiService, parseResume };
}

function buildStorageMock() {
  const createSignedUrl = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('https://signed.example/file');
  const storageService = { createSignedUrl } as unknown as SupabaseStorageService;
  return { storageService, createSignedUrl };
}

function buildService() {
  const prismaMock = buildPrismaMock();
  const aiMock = buildAiServiceMock();
  const storageMock = buildStorageMock();
  const service = new ResumesService(prismaMock.prisma, aiMock.aiService, storageMock.storageService);
  return { service, prismaMock, aiMock, storageMock };
}

const ACTIVE_FILE_ASSET = { id: 'file-1', status: 'ACTIVE' };

describe('ResumesService.create', () => {
  it('throws 409 when the file asset is not ACTIVE', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.candidateFindFirst.mockResolvedValue({ id: 'candidate-1' });
    prismaMock.fileAssetFindFirst.mockResolvedValue({ id: 'file-1', status: 'DELETED' });

    await expect(
      service.create({ candidateId: 'candidate-1', fileAssetId: 'file-1' }, 'org-1'),
    ).rejects.toThrow(AppException);
  });

  it('throws 409 when the file asset is already linked to another resume', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.candidateFindFirst.mockResolvedValue({ id: 'candidate-1' });
    prismaMock.fileAssetFindFirst.mockResolvedValue(ACTIVE_FILE_ASSET);
    prismaMock.resumeFindFirst.mockResolvedValue({ id: 'existing-resume' });

    await expect(
      service.create({ candidateId: 'candidate-1', fileAssetId: 'file-1' }, 'org-1'),
    ).rejects.toThrow(AppException);
  });

  it('creates a PENDING resume when the file asset is active and unlinked', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.candidateFindFirst.mockResolvedValue({ id: 'candidate-1' });
    prismaMock.fileAssetFindFirst.mockResolvedValue(ACTIVE_FILE_ASSET);
    prismaMock.resumeFindFirst.mockResolvedValue(null);
    prismaMock.resumeCreate.mockResolvedValue({ id: 'resume-1', parseStatus: 'PENDING' });

    const result = await service.create({ candidateId: 'candidate-1', fileAssetId: 'file-1' }, 'org-1');

    expect(result).toEqual({ id: 'resume-1', parseStatus: 'PENDING' });
    expect(prismaMock.resumeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parseStatus: 'PENDING' }) }),
    );
  });
});

describe('ResumesService.parse', () => {
  const RESUME_WITH_FILE = {
    id: 'resume-1',
    candidateId: 'candidate-1',
    fileAsset: { storageKey: 'key-1', bucket: 'cv-files', fileName: 'cv.pdf', fileType: 'PDF', checksum: 'abc' },
  };

  it('throws 404 when the resume is not found in the organization', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.resumeFindFirst.mockResolvedValue(null);

    await expect(service.parse('resume-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('throws 409 when the resume has no backing file', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.resumeFindFirst.mockResolvedValue({ id: 'resume-1', fileAsset: null });

    await expect(service.parse('resume-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('parses successfully: sets PROCESSING then SUCCESS, and syncs the candidate normalized profile', async () => {
    const { service, prismaMock, aiMock } = buildService();
    prismaMock.resumeFindFirst.mockResolvedValue(RESUME_WITH_FILE);
    aiMock.parseResume.mockResolvedValue({
      raw_text: 'parsed text',
      parsed_data: { skills: ['Docker'] },
      parser_version: 'v2',
    });
    prismaMock.resumeUpdate.mockResolvedValue({ id: 'resume-1', parseStatus: 'SUCCESS' });

    const result = await service.parse('resume-1', 'org-1');

    expect(result).toEqual({ id: 'resume-1', parseStatus: 'SUCCESS' });
    expect(prismaMock.resumeUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ parseStatus: 'PROCESSING' }) }),
    );
    expect(prismaMock.resumeUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ parseStatus: 'SUCCESS', rawText: 'parsed text' }) }),
    );
    expect(prismaMock.candidateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'candidate-1' },
        data: { normalizedProfile: { skills: ['Docker'] } },
      }),
    );
  });

  it('marks the resume FAILED and rethrows as a 502 when the AI service call fails', async () => {
    const { service, prismaMock, aiMock } = buildService();
    prismaMock.resumeFindFirst.mockResolvedValue(RESUME_WITH_FILE);
    aiMock.parseResume.mockRejectedValue(new Error('AI service unreachable'));

    await expect(service.parse('resume-1', 'org-1')).rejects.toThrow(AppException);
    expect(prismaMock.resumeUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ parseStatus: 'FAILED', parsingError: 'AI service unreachable' }),
      }),
    );
  });
});

describe('ResumesService.remove', () => {
  it('throws 409 when the resume already has applications', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.resumeFindFirst.mockResolvedValue({ id: 'resume-1', candidateId: 'candidate-1' });
    prismaMock.applicationCount.mockResolvedValue(1);

    await expect(service.remove('resume-1', 'org-1')).rejects.toThrow(AppException);
    expect(prismaMock.resumeDelete).not.toHaveBeenCalled();
  });

  it('deletes the resume when it has no applications', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.resumeFindFirst.mockResolvedValue({ id: 'resume-1', candidateId: 'candidate-1' });
    prismaMock.applicationCount.mockResolvedValue(0);

    await expect(service.remove('resume-1', 'org-1')).resolves.toEqual({ id: 'resume-1', deleted: true });
    expect(prismaMock.resumeDelete).toHaveBeenCalledWith({ where: { id: 'resume-1' } });
  });
});
