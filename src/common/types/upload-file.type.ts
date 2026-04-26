export type UploadMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type UploadFileExtension = 'pdf' | 'docx';

export type UploadedFileMetadata = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  storageKey: string;
};

export type UploadFileInput = {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

export type MulterUploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type StorageUploadResult = {
  storageKey: string;
  url: string;
};
