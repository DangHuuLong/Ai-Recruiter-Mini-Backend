// Service for FileAsset records: validates and uploads files to storage, and manages metadata (fetch, signed download URL, soft-delete).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileAssetStatus } from '@prisma/client';

import {
  DEFAULT_MAX_FILE_SIZE_MB,
} from '../../common/constants/upload.constants';
import { AppException } from '../../common/exceptions/app.exception';
import type { UploadFileInput } from '../../common/types/upload-file.type';
import {
  calculateFileChecksum,
  generateStorageKey,
  getMaxUploadFileSizeBytes,
  isAllowedUploadMimeType,
  resolveResumeFileType,
} from '../../common/utils/upload-file.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SupabaseStorageService } from '../../integrations/storage/supabase-storage.service';

const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 600;

@Injectable()
export class FilesService {
  private readonly maxFileSizeBytes: number;

  // Resolves the configured MAX_FILE_SIZE_MB into a byte limit used by uploadFile's validation.
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: SupabaseStorageService,
  ) {
    const maxFileSizeMb =
      Number(this.configService.get<number>('MAX_FILE_SIZE_MB')) || DEFAULT_MAX_FILE_SIZE_MB;

    this.maxFileSizeBytes = getMaxUploadFileSizeBytes(maxFileSizeMb);
  }

  // Called by FilesController.uploadFile — validates type/size, uploads to Supabase storage, and persists a FileAsset row.
  async uploadFile(organizationId: string, file?: UploadFileInput) {
    if (!file) {
      throw new AppException('File is required', 400);
    }

    if (!isAllowedUploadMimeType(file.mimeType)) {
      throw new AppException('Invalid file type. Only PDF and DOCX are allowed', 400);
    }

    if (file.size > this.maxFileSizeBytes) {
      throw new AppException('File size exceeds the allowed limit', 400);
    }

    let fileType;
    let storageKey: string;

    try {
      fileType = resolveResumeFileType(file.mimeType);
      storageKey = generateStorageKey(file.originalName);
    } catch {
      throw new AppException('Unsupported file type or extension', 400);
    }

    const checksum = calculateFileChecksum(file.buffer);
    const bucket = this.storageService.getDefaultBucket();

    await this.storageService.uploadFile({
      storageKey,
      buffer: file.buffer,
      contentType: file.mimeType,
    });

    const originalFileUrl = this.storageService.getPublicUrl(storageKey);

    return this.prisma.fileAsset.create({
      data: {
        organizationId,
        fileName: file.originalName,
        originalFileUrl,
        storageKey,
        fileType,
        fileSizeBytes: file.size,
        checksum,
        bucket,
        status: FileAssetStatus.ACTIVE,
      },
    });
  }

  // Fetches an active FileAsset scoped to the org; reused by getDownloadUrl and remove, and directly by FilesController.findOne.
  async findOne(id: string, organizationId: string) {
    const fileAsset = await this.prisma.fileAsset.findFirst({
      where: {
        id,
        organizationId,
        status: FileAssetStatus.ACTIVE,
      },
    });

    if (!fileAsset) {
      throw new AppException('File not found', 404);
    }

    return fileAsset;
  }

  // Called by FilesController.getDownloadUrl — mints a time-limited signed URL from SupabaseStorageService.
  async getDownloadUrl(id: string, organizationId: string) {
    const fileAsset = await this.findOne(id, organizationId);
    const url = await this.storageService.createSignedUrl(
      fileAsset.storageKey,
      DOWNLOAD_URL_EXPIRES_IN_SECONDS,
      fileAsset.bucket,
    );

    return { url, expiresIn: DOWNLOAD_URL_EXPIRES_IN_SECONDS };
  }

  // Called by FilesController.remove — blocks deletion if a resume references the file, else soft-deletes it.
  async remove(id: string, organizationId: string) {
    const fileAsset = await this.prisma.fileAsset.findFirst({
      where: {
        id,
        organizationId,
        status: FileAssetStatus.ACTIVE,
      },
      include: {
        resumes: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!fileAsset) {
      throw new AppException('File not found', 404);
    }

    if (fileAsset.resumes.length > 0) {
      throw new AppException('File is already linked to a resume', 409);
    }

    await this.storageService.removeFile(fileAsset.storageKey, fileAsset.bucket);

    await this.prisma.fileAsset.update({
      where: {
        id: fileAsset.id,
      },
      data: {
        status: FileAssetStatus.DELETED,
        deletedAt: new Date(),
      },
    });

    return {
      id: fileAsset.id,
      deleted: true,
    };
  }
}
