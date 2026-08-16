import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';

import { FilesService } from './files.service';
import { AppException } from '../../common/exceptions/app.exception';
import type { UploadFileInput } from '../../common/types/upload-file.type';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

function buildPrismaMock() {
  const fileAssetCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const fileAssetFindFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const fileAssetUpdate = jest.fn<(...args: unknown[]) => Promise<unknown>>();

  const prisma = {
    fileAsset: { create: fileAssetCreate, findFirst: fileAssetFindFirst, update: fileAssetUpdate },
  } as unknown as PrismaService;

  return { prisma, fileAssetCreate, fileAssetFindFirst, fileAssetUpdate };
}

function buildStorageMock() {
  const uploadFile = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const getPublicUrl = jest.fn().mockReturnValue('https://example.com/cv.pdf');
  const getDefaultBucket = jest.fn<() => string>().mockReturnValue('cv-files');
  const createSignedUrl = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('https://signed.example');
  const removeFile = jest.fn<(...args: unknown[]) => Promise<void>>();

  const storageService = {
    uploadFile,
    getPublicUrl,
    getDefaultBucket,
    createSignedUrl,
    removeFile,
  } as unknown as SupabaseStorageService;

  return { storageService, uploadFile, getPublicUrl, getDefaultBucket, createSignedUrl, removeFile };
}

function buildService(maxFileSizeMb = 5) {
  const prismaMock = buildPrismaMock();
  const storageMock = buildStorageMock();
  const configService = { get: jest.fn().mockReturnValue(maxFileSizeMb) } as unknown as ConfigService;

  const service = new FilesService(prismaMock.prisma, configService, storageMock.storageService);

  return { service, prismaMock, storageMock };
}

function buildFile(overrides: Partial<UploadFileInput> = {}): UploadFileInput {
  return {
    originalName: 'resume.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('%PDF-1.4 fake content'),
    ...overrides,
  };
}

describe('FilesService.uploadFile', () => {
  it('throws 400 when no file is given', async () => {
    const { service } = buildService();

    await expect(service.uploadFile('org-1', undefined)).rejects.toThrow(AppException);
  });

  it('throws 400 for an unsupported mime type', async () => {
    const { service } = buildService();

    await expect(
      service.uploadFile('org-1', buildFile({ mimeType: 'image/png' })),
    ).rejects.toThrow(AppException);
  });

  it('throws 400 when the file exceeds the configured size limit', async () => {
    const { service } = buildService(1); // 1MB limit

    await expect(
      service.uploadFile('org-1', buildFile({ size: 2 * 1024 * 1024 })),
    ).rejects.toThrow(AppException);
  });

  it('uploads to storage and persists an ACTIVE FileAsset for a valid file', async () => {
    const { service, prismaMock, storageMock } = buildService();
    prismaMock.fileAssetCreate.mockResolvedValue({ id: 'file-1', status: 'ACTIVE' });

    const result = await service.uploadFile('org-1', buildFile());

    expect(result).toEqual({ id: 'file-1', status: 'ACTIVE' });
    expect(storageMock.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf' }),
    );
    expect(prismaMock.fileAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1', status: 'ACTIVE' }),
      }),
    );
  });
});

describe('FilesService.getDownloadUrl', () => {
  it('throws 404 when the file does not exist in the organization', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.fileAssetFindFirst.mockResolvedValue(null);

    await expect(service.getDownloadUrl('file-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('returns a signed URL with the fixed expiry for an existing file', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.fileAssetFindFirst.mockResolvedValue({
      id: 'file-1',
      storageKey: 'key-1',
      bucket: 'cv-files',
    });

    const result = await service.getDownloadUrl('file-1', 'org-1');

    expect(result).toEqual({ url: 'https://signed.example', expiresIn: 600 });
  });
});

describe('FilesService.remove', () => {
  it('throws 404 when the file does not exist in the organization', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.fileAssetFindFirst.mockResolvedValue(null);

    await expect(service.remove('file-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('throws 409 when the file is already linked to a resume', async () => {
    const { service, prismaMock } = buildService();
    prismaMock.fileAssetFindFirst.mockResolvedValue({
      id: 'file-1',
      storageKey: 'key-1',
      bucket: 'cv-files',
      resumes: [{ id: 'resume-1' }],
    });

    await expect(service.remove('file-1', 'org-1')).rejects.toThrow(AppException);
  });

  it('removes the storage object and soft-deletes the FileAsset when unlinked', async () => {
    const { service, prismaMock, storageMock } = buildService();
    prismaMock.fileAssetFindFirst.mockResolvedValue({
      id: 'file-1',
      storageKey: 'key-1',
      bucket: 'cv-files',
      resumes: [],
    });

    const result = await service.remove('file-1', 'org-1');

    expect(result).toEqual({ id: 'file-1', deleted: true });
    expect(storageMock.removeFile).toHaveBeenCalledWith('key-1', 'cv-files');
    expect(prismaMock.fileAssetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'file-1' },
        data: expect.objectContaining({ status: 'DELETED' }),
      }),
    );
  });
});
