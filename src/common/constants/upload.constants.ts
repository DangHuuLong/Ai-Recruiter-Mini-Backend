export const UPLOAD_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const UPLOAD_ALLOWED_FILE_EXTENSIONS = ['pdf', 'docx'] as const;

export const DEFAULT_MAX_FILE_SIZE_MB = 5;

export const BYTES_PER_MB = 1024 * 1024;

export const DEFAULT_UPLOAD_BUCKET = 'cv-files';

export const UPLOAD_STORAGE_FOLDER = 'resumes';
