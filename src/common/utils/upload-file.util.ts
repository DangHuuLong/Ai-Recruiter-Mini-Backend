import {
  BYTES_PER_MB,
  UPLOAD_ALLOWED_MIME_TYPES,
} from '../constants/upload.constants';

export function isAllowedUploadMimeType(mimeType: string): boolean {
  return UPLOAD_ALLOWED_MIME_TYPES.includes(
    mimeType as (typeof UPLOAD_ALLOWED_MIME_TYPES)[number],
  );
}

export function getMaxUploadFileSizeBytes(maxFileSizeMb: number): number {
  return maxFileSizeMb * BYTES_PER_MB;
}

export function isFileSizeAllowed(
  fileSizeBytes: number,
  maxFileSizeMb: number,
): boolean {
  return fileSizeBytes <= getMaxUploadFileSizeBytes(maxFileSizeMb);
}