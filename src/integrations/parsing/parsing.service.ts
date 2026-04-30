import { Injectable } from '@nestjs/common';
import { ResumeFileType } from '@prisma/client';
import { createRequire } from 'node:module';

import { AppException } from '../../common/exceptions/app.exception';

const requirePackage = createRequire(__filename);

type MammothModule = {
  extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
};

@Injectable()
export class ParsingService {
  async extractResumeText(params: { buffer: Buffer; fileType: ResumeFileType }): Promise<string> {
    const rawText =
      params.fileType === ResumeFileType.PDF
        ? await this.extractPdfText(params.buffer)
        : await this.extractDocxText(params.buffer);

    const normalizedText = this.normalizeExtractedText(rawText);

    if (!normalizedText) {
      throw new AppException('Resume file does not contain extractable text', 422);
    }

    return normalizedText;
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const { PDFParse } = requirePackage('pdf-parse') as {
        PDFParse: new (options: { data: Buffer }) => {
          getText(): Promise<{ text?: string }>;
          destroy?: () => Promise<void> | void;
        };
      };

      const parser = new PDFParse({ data: buffer });

      try {
        const result = await parser.getText();
        const hyperlinkText = this.extractPdfHyperlinkText(buffer);

        return [result.text ?? '', hyperlinkText].filter(Boolean).join('\n');
      } finally {
        await parser.destroy?.();
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException('Failed to extract text from PDF file', 422);
    }
  }

  private extractPdfHyperlinkText(buffer: Buffer): string {
    const urls = this.extractPdfHyperlinkUrls(buffer);

    if (!urls.length) {
      return '';
    }

    return urls.join('\n');
  }

  private extractPdfHyperlinkUrls(buffer: Buffer): string[] {
    const pdfSource = buffer.toString('latin1');
    const urls: string[] = [];
    const uriPattern = /\/URI\s*(?:\((?<literal>(?:\\.|[^\\)])*)\)|<(?<hex>[0-9A-Fa-f\s]+)>)/g;

    for (const match of pdfSource.matchAll(uriPattern)) {
      const rawUrl = match.groups?.literal
        ? this.decodePdfLiteralString(match.groups.literal)
        : this.decodePdfHexString(match.groups?.hex ?? '');

      const url = this.normalizeExtractedUrl(rawUrl);
      if (url) {
        urls.push(url);
      }
    }

    return this.uniqueInOrder(urls);
  }

  private decodePdfLiteralString(value: string): string {
    return value
      .replace(/\\([nrtbf()\\])/g, (_, escaped: string) => {
        const replacements: Record<string, string> = {
          n: '\n',
          r: '\r',
          t: '\t',
          b: '\b',
          f: '\f',
          '(': '(',
          ')': ')',
          '\\': '\\',
        };

        return replacements[escaped] ?? escaped;
      })
      .replace(/\\\r?\n/g, '')
      .trim();
  }

  private decodePdfHexString(value: string): string {
    const hex = value.replace(/\s+/g, '');
    if (!hex || hex.length % 2 !== 0) {
      return '';
    }

    try {
      return Buffer.from(hex, 'hex').toString('utf8').trim();
    } catch {
      return '';
    }
  }

  private normalizeExtractedUrl(value: string): string | null {
    const cleaned = value.trim().replace(/[\u0000\s]+$/g, '').replace(/[.,;)]+$/g, '');
    if (!/^https?:\/\//i.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  private uniqueInOrder(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(value);
    }

    return result;
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const mammoth = this.loadMammoth();
    const result = await mammoth.extractRawText({ buffer });

    return result.value ?? '';
  }

  private loadMammoth(): MammothModule {
    try {
      return requirePackage('mammoth') as MammothModule;
    } catch {
      throw new AppException('DOCX text extraction dependency is not installed', 500);
    }
  }

  private normalizeExtractedText(text: string): string {
    return (text ?? '')
      .replace(/\u0000/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }
}
