import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileAssetStatus } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_UPLOAD_BUCKET,
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

@Injectable()
export class FilesService {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;
  private readonly maxFileSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceRoleKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new AppException('Supabase configuration is missing', 500);
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    this.bucket =
      this.configService.get<string>('SUPABASE_BUCKET') ||
      DEFAULT_UPLOAD_BUCKET;

    const maxFileSizeMb =
      Number(this.configService.get<number>('MAX_FILE_SIZE_MB')) ||
      DEFAULT_MAX_FILE_SIZE_MB;

    this.maxFileSizeBytes = getMaxUploadFileSizeBytes(maxFileSizeMb);
  }

  async uploadFile(file?: UploadFileInput) {
    if (!file) {
      throw new AppException('File is required', 400);
    }

    if (!isAllowedUploadMimeType(file.mimeType)) {
      throw new AppException(
        'Invalid file type. Only PDF and DOCX are allowed',
        400,
      );
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

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(storageKey, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new AppException('Failed to upload file to storage', 502);
    }

    const { data } = this.supabase.storage
      .from(this.bucket)
      .getPublicUrl(storageKey);

    return this.prisma.fileAsset.create({
      data: {
        fileName: file.originalName,
        originalFileUrl: data.publicUrl,
        storageKey,
        fileType,
        fileSizeBytes: file.size,
        checksum,
        bucket: this.bucket,
        status: FileAssetStatus.ACTIVE,
      },
    });
  }

  async findOne(id: string) {
    const fileAsset = await this.prisma.fileAsset.findFirst({
      where: {
        id,
        status: FileAssetStatus.ACTIVE,
      },
    });

    if (!fileAsset) {
      throw new AppException('File not found', 404);
    }

    return fileAsset;
  }

  async remove(id: string) {
    const fileAsset = await this.prisma.fileAsset.findFirst({
      where: {
        id,
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

    const { error: deleteError } = await this.supabase.storage
      .from(fileAsset.bucket)
      .remove([fileAsset.storageKey]);

    if (deleteError) {
      throw new AppException('Failed to delete file from storage', 502);
    }

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