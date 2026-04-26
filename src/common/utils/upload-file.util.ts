import { ResumeFileType } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';

import {
  BYTES_PER_MB,
  UPLOAD_ALLOWED_FILE_EXTENSIONS,
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_STORAGE_FOLDER,
} from '../constants/upload.constants';
import {
  MulterUploadedFile,
  UploadFileExtension,
  UploadFileInput,
} from '../types/upload-file.type';

export function isAllowedUploadMimeType(mimeType: string): boolean {
  return UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType as (typeof UPLOAD_ALLOWED_MIME_TYPES)[number]);
}

export function getMaxUploadFileSizeBytes(maxFileSizeMb: number): number {
  return maxFileSizeMb * BYTES_PER_MB;
}

export function isFileSizeAllowed(fileSizeBytes: number, maxFileSizeMb: number): boolean {
  return fileSizeBytes <= getMaxUploadFileSizeBytes(maxFileSizeMb);
}

export function mapMulterFileToUploadFileInput(file: MulterUploadedFile): UploadFileInput {
  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  };
}

export function resolveResumeFileType(mimeType: string): ResumeFileType {
  if (mimeType === 'application/pdf') {
    return ResumeFileType.PDF;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return ResumeFileType.DOCX;
  }

  throw new Error('Unsupported file type');
}

export function calculateFileChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function generateStorageKey(originalName: string): string {
  const extension = getUploadFileExtension(originalName);

  return `${UPLOAD_STORAGE_FOLDER}/${randomUUID()}.${extension}`;
}

export function getUploadFileExtension(originalName: string): UploadFileExtension {
  const extension = extname(originalName).replace('.', '').toLowerCase();

  if (
    UPLOAD_ALLOWED_FILE_EXTENSIONS.includes(
      extension as (typeof UPLOAD_ALLOWED_FILE_EXTENSIONS)[number],
    )
  ) {
    return extension as UploadFileExtension;
  }

  throw new Error('Unsupported file extension');
}
