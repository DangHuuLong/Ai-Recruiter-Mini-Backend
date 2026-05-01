import { jest, describe, beforeEach, expect, it } from '@jest/globals';
import { ResumeFileType } from '@prisma/client';

import { ParsingService } from './parsing.service';
import { AppException } from '../../common/exceptions/app.exception';

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

  it('places GitHub repo hyperlinks under the matching project title', () => {
    const text = [
      'PROJECTS',
      'KaiSneaker – E-commerce Website',
      'Full Stack Developer',
      'Technologies: ReactJS (TypeScript), PostgreSQL, RESTful API , Java (Spring Boot)',
      '04/2022 – 06/2022',
      'Description:',
      'A modern e-commerce web application for selling sneakers with complete',
      'frontend/backend integration.',
      'CinemaNHK – Movie Ticket Booking System',
      'Full Stack Developer',
      'Technologies: C#, SQL Server, DevExpress, Microsoft Visual Studio',
      '09/2021 – 12/2021',
      'Description:',
      'An desktop application for the booking and management of cinema tickets.',
    ].join('\n');

    const result = (
      service as unknown as {
        injectHyperlinksIntoText(input: string, links: { url: string; label?: string }[]): string;
      }
    ).injectHyperlinksIntoText(text, [
      { url: 'https://github.com/ThueCode/KaiSneaker', label: 'Description' },
      { url: 'https://github.com/nhkkhaii/CinemaNHK', label: 'Description' },
    ]);

    const lines = result.split('\n');
    const kaiSneakerTitleIndex = lines.indexOf('KaiSneaker – E-commerce Website');
    const cinemaTitleIndex = lines.indexOf('CinemaNHK – Movie Ticket Booking System');

    expect(lines[kaiSneakerTitleIndex + 1]).toBe('https://github.com/ThueCode/KaiSneaker');
    expect(lines[cinemaTitleIndex + 1]).toBe('https://github.com/nhkkhaii/CinemaNHK');
  });

  it('does not inject weak labels like Description after the first matching label', () => {
    const text = ['Project A', 'Description:', 'Project B', 'Description:'].join('\n');

    const result = (
      service as unknown as {
        injectHyperlinksIntoText(input: string, links: { url: string; label?: string }[]): string;
      }
    ).injectHyperlinksIntoText(text, [
      { url: 'https://example.com/project-b', label: 'Description' },
    ]);

    expect(result.split('\n')).toEqual([
      'Project A',
      'Description:',
      'Project B',
      'Description:',
      'https://example.com/project-b',
    ]);
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
