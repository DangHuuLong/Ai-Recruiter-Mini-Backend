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
        return result.text ?? '';
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
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }
}
