// Helpers for validating, checksumming, and naming uploaded resume files.
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

// Called during resume upload validation to reject unsupported file types before storage.
export function isAllowedUploadMimeType(mimeType: string): boolean {
  return UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType as (typeof UPLOAD_ALLOWED_MIME_TYPES)[number]);
}

// Converts the configured max-size-in-MB into bytes; used by isFileSizeAllowed().
export function getMaxUploadFileSizeBytes(maxFileSizeMb: number): number {
  return maxFileSizeMb * BYTES_PER_MB;
}

// Called during resume upload validation to reject oversized files before storage.
export function isFileSizeAllowed(fileSizeBytes: number, maxFileSizeMb: number): boolean {
  return fileSizeBytes <= getMaxUploadFileSizeBytes(maxFileSizeMb);
}

// Adapts a Multer-parsed upload into the internal UploadFileInput shape consumed by the resume upload service.
export function mapMulterFileToUploadFileInput(file: MulterUploadedFile): UploadFileInput {
  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  };
}

// Maps an uploaded file's MIME type to the Prisma ResumeFileType enum stored on the Resume record.
export function resolveResumeFileType(mimeType: string): ResumeFileType {
  if (mimeType === 'application/pdf') {
    return ResumeFileType.PDF;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return ResumeFileType.DOCX;
  }

  throw new Error('Unsupported file type');
}

// Called during resume upload to dedupe identical files by content hash before storing them.
export function calculateFileChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// Called by the upload service to build the object storage path/key for a new FileAsset.
export function generateStorageKey(originalName: string): string {
  const extension = getUploadFileExtension(originalName);

  return `${UPLOAD_STORAGE_FOLDER}/${randomUUID()}.${extension}`;
}

// Called by generateStorageKey() and upload validation to derive/validate the file extension.
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
