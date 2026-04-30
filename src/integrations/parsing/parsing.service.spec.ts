import { ResumeFileType } from '@prisma/client';

import { AppException } from '../../common/exceptions/app.exception';
import { ParsingService } from './parsing.service';

const getTextMock = jest.fn(async () => ({
  text: ' John Doe \n\n Python FastAPI ',
}));
const destroyMock = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: getTextMock,
    destroy: destroyMock,
  })),
}));

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(async () => ({
    value: ' Jane Doe \r\n TypeScript NestJS ',
  })),
}));

describe('ParsingService', () => {
  let service: ParsingService;

  beforeEach(() => {
    service = new ParsingService();
    getTextMock.mockResolvedValue({
      text: ' John Doe \n\n Python FastAPI ',
    });
    destroyMock.mockClear();
  });

  it('extracts and normalizes text from PDF buffers', async () => {
    const result = await service.extractResumeText({
      buffer: Buffer.from('pdf'),
      fileType: ResumeFileType.PDF,
    });

    expect(result).toBe('John Doe\nPython FastAPI');
  });

  it('appends PDF hyperlink annotation URLs to extracted text', async () => {
    getTextMock.mockResolvedValueOnce({
      text: 'Dang Huu Long\nLien ket\nGithub',
    });

    const pdfWithLink = Buffer.from(
      '1 0 obj << /Type /Annot /Subtype /Link /A << /S /URI /URI (https://github.com/DangHuuLong) >> >> endobj',
      'latin1',
    );

    const result = await service.extractResumeText({
      buffer: pdfWithLink,
      fileType: ResumeFileType.PDF,
    });

    expect(result).toContain('Dang Huu Long');
    expect(result).toContain('Github');
    expect(result).toContain('https://github.com/DangHuuLong');
  });

  it('deduplicates PDF hyperlink annotation URLs', async () => {
    getTextMock.mockResolvedValueOnce({
      text: 'Dang Huu Long\nGithub',
    });

    const pdfWithDuplicateLinks = Buffer.from(
      [
        '1 0 obj << /A << /S /URI /URI (https://github.com/DangHuuLong) >> >> endobj',
        '2 0 obj << /A << /S /URI /URI (https://github.com/DangHuuLong) >> >> endobj',
      ].join('\n'),
      'latin1',
    );

    const result = await service.extractResumeText({
      buffer: pdfWithDuplicateLinks,
      fileType: ResumeFileType.PDF,
    });

    expect(result.match(/https:\/\/github\.com\/DangHuuLong/g)).toHaveLength(1);
  });

  it('extracts and normalizes text from DOCX buffers', async () => {
    const result = await service.extractResumeText({
      buffer: Buffer.from('docx'),
      fileType: ResumeFileType.DOCX,
    });

    expect(result).toBe('Jane Doe\nTypeScript NestJS');
  });

  it('removes null bytes from extracted text before persistence', async () => {
    getTextMock.mockResolvedValueOnce({
      text: 'Nguyen\u0000 Quoc\u0000 Binh\nFrontend Developer',
    });

    const result = await service.extractResumeText({
      buffer: Buffer.from('pdf-with-null-byte'),
      fileType: ResumeFileType.PDF,
    });

    expect(result).toBe('Nguyen Quoc Binh\nFrontend Developer');
    expect(result).not.toContain('\u0000');
  });

  it('rejects files with no extractable text', async () => {
    getTextMock.mockResolvedValueOnce({ text: '   ' });

    await expect(
      service.extractResumeText({
        buffer: Buffer.from('empty'),
        fileType: ResumeFileType.PDF,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
