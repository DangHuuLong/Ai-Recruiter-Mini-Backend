import { ResumeFileType } from '@prisma/client';

import { AppException } from '../../common/exceptions/app.exception';
import { ParsingService } from './parsing.service';

jest.mock('pdf-parse', () =>
  jest.fn(async () => ({
    text: ' John Doe \n\n Python FastAPI ',
  })),
);

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(async () => ({
    value: ' Jane Doe \r\n TypeScript NestJS ',
  })),
}));

describe('ParsingService', () => {
  let service: ParsingService;

  beforeEach(() => {
    service = new ParsingService();
  });

  it('extracts and normalizes text from PDF buffers', async () => {
    const result = await service.extractResumeText({
      buffer: Buffer.from('pdf'),
      fileType: ResumeFileType.PDF,
    });

    expect(result).toBe('John Doe\nPython FastAPI');
  });

  it('extracts and normalizes text from DOCX buffers', async () => {
    const result = await service.extractResumeText({
      buffer: Buffer.from('docx'),
      fileType: ResumeFileType.DOCX,
    });

    expect(result).toBe('Jane Doe\nTypeScript NestJS');
  });

  it('rejects files with no extractable text', async () => {
    const pdfParse = jest.requireMock('pdf-parse') as jest.Mock;
    pdfParse.mockResolvedValueOnce({ text: '   ' });

    await expect(
      service.extractResumeText({
        buffer: Buffer.from('empty'),
        fileType: ResumeFileType.PDF,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
