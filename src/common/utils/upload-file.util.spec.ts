import { describe, expect, it } from '@jest/globals';
import { ResumeFileType } from '@prisma/client';

import {
  calculateFileChecksum,
  generateStorageKey,
  getMaxUploadFileSizeBytes,
  getUploadFileExtension,
  isAllowedUploadMimeType,
  isFileSizeAllowed,
  mapMulterFileToUploadFileInput,
  resolveResumeFileType,
} from './upload-file.util';

describe('isAllowedUploadMimeType', () => {
  it('allows PDF and DOCX mime types', () => {
    expect(isAllowedUploadMimeType('application/pdf')).toBe(true);
    expect(
      isAllowedUploadMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('rejects unsupported mime types', () => {
    expect(isAllowedUploadMimeType('text/plain')).toBe(false);
    expect(isAllowedUploadMimeType('image/png')).toBe(false);
  });
});

describe('getMaxUploadFileSizeBytes / isFileSizeAllowed', () => {
  it('converts MB to bytes', () => {
    expect(getMaxUploadFileSizeBytes(5)).toBe(5 * 1024 * 1024);
  });

  it('allows files at or under the limit', () => {
    expect(isFileSizeAllowed(5 * 1024 * 1024, 5)).toBe(true);
    expect(isFileSizeAllowed(1, 5)).toBe(true);
  });

  it('rejects files over the limit', () => {
    expect(isFileSizeAllowed(5 * 1024 * 1024 + 1, 5)).toBe(false);
  });
});

describe('resolveResumeFileType', () => {
  it('maps application/pdf to ResumeFileType.PDF', () => {
    expect(resolveResumeFileType('application/pdf')).toBe(ResumeFileType.PDF);
  });

  it('maps the docx mime type to ResumeFileType.DOCX', () => {
    expect(
      resolveResumeFileType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(ResumeFileType.DOCX);
  });

  it('throws for unsupported mime types', () => {
    expect(() => resolveResumeFileType('image/png')).toThrow('Unsupported file type');
  });
});

describe('getUploadFileExtension', () => {
  it('extracts and lowercases a supported extension', () => {
    expect(getUploadFileExtension('resume.PDF')).toBe('pdf');
    expect(getUploadFileExtension('resume.docx')).toBe('docx');
  });

  it('throws for an unsupported extension', () => {
    expect(() => getUploadFileExtension('resume.txt')).toThrow('Unsupported file extension');
  });

  it('throws when there is no extension at all', () => {
    expect(() => getUploadFileExtension('resume')).toThrow('Unsupported file extension');
  });
});

describe('generateStorageKey', () => {
  it('builds a storage key under the resumes folder with the original extension', () => {
    const key = generateStorageKey('my-resume.pdf');
    expect(key).toMatch(/^resumes\/[0-9a-f-]{36}\.pdf$/);
  });

  it('throws for an unsupported extension, same as getUploadFileExtension', () => {
    expect(() => generateStorageKey('my-resume.exe')).toThrow('Unsupported file extension');
  });
});

describe('calculateFileChecksum', () => {
  it('is deterministic sha256 hex for the same content', () => {
    const buffer = Buffer.from('resume content');
    expect(calculateFileChecksum(buffer)).toBe(calculateFileChecksum(buffer));
    expect(calculateFileChecksum(buffer)).toHaveLength(64);
  });
});

describe('mapMulterFileToUploadFileInput', () => {
  it('adapts a Multer file object into UploadFileInput', () => {
    const buffer = Buffer.from('content');
    const result = mapMulterFileToUploadFileInput({
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    } as Parameters<typeof mapMulterFileToUploadFileInput>[0]);

    expect(result).toEqual({
      originalName: 'resume.pdf',
      mimeType: 'application/pdf',
      size: buffer.length,
      buffer,
    });
  });
});
