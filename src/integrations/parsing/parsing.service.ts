import { Injectable } from '@nestjs/common';
import { ResumeFileType } from '@prisma/client';
import { createRequire } from 'node:module';

import { AppException } from '../../common/exceptions/app.exception';

const requirePackage = createRequire(__filename);

const WEAK_LINK_LABELS = new Set([
  'description',
  'key contributions',
  'key responsibilities',
  'link',
  'link github',
  'project',
  'projects',
  'technologies',
  'technology',
]);

type MammothModule = {
  extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
};

type PdfHyperlink = {
  url: string;
  label?: string;
};

type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

type PdfAnnotation = {
  url?: string;
  unsafeUrl?: string;
  rect?: number[];
};

type PdfJsModule = {
  getDocument(input: { data: Uint8Array; disableWorker?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items?: PdfTextItem[] }>;
        getAnnotations(params?: { intent?: string }): Promise<PdfAnnotation[]>;
      }>;
      destroy?: () => Promise<void> | void;
    }>;
  };
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
        const hyperlinks = await this.extractPdfHyperlinks(buffer);

        return this.injectHyperlinksIntoText(result.text ?? '', hyperlinks);
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

  private async extractPdfHyperlinks(buffer: Buffer): Promise<PdfHyperlink[]> {
    const parsedLinks = await this.extractPdfHyperlinksWithPdfJs(buffer);

    if (parsedLinks.length) {
      return parsedLinks;
    }

    return this.extractPdfHyperlinksFromRawSource(buffer);
  }

  private async extractPdfHyperlinksWithPdfJs(buffer: Buffer): Promise<PdfHyperlink[]> {
    let loadingTask:
      | {
          promise: Promise<{
            numPages: number;
            getPage(pageNumber: number): Promise<{
              getTextContent(): Promise<{ items?: PdfTextItem[] }>;
              getAnnotations(params?: { intent?: string }): Promise<PdfAnnotation[]>;
            }>;
            destroy?: () => Promise<void> | void;
          }>;
        }
      | undefined;

    try {
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJsModule;
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
      });
      const document = await loadingTask.promise;
      const links: PdfHyperlink[] = [];

      try {
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const [textContent, annotations] = await Promise.all([
            page.getTextContent(),
            page.getAnnotations({ intent: 'display' }),
          ]);

          const textItems = textContent.items ?? [];
          for (const annotation of annotations) {
            const url = this.normalizeExtractedUrl(annotation.url ?? annotation.unsafeUrl ?? '');
            if (!url) {
              continue;
            }

            links.push({
              url,
              label: this.findAnnotationLabel(annotation.rect, textItems),
            });
          }
        }
      } finally {
        await document.destroy?.();
      }

      return links;
    } catch {
      return [];
    }
  }

  private findAnnotationLabel(
    rect: number[] | undefined,
    textItems: PdfTextItem[],
  ): string | undefined {
    if (!rect || rect.length < 4) {
      return undefined;
    }

    const [x1, y1, x2, y2] = rect;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const overlappingItems = textItems
      .map((item) => {
        const transform = item.transform ?? [];
        const x = transform[4] ?? 0;
        const y = transform[5] ?? 0;
        const width = item.width ?? 0;
        const height = Math.abs(item.height ?? transform[3] ?? 0);
        const centerY = y + height / 2;

        return {
          text: item.str?.trim() ?? '',
          x,
          y,
          width,
          centerY,
        };
      })
      .filter((item) => {
        if (!item.text) {
          return false;
        }

        const itemEndX = item.x + item.width;
        const horizontallyOverlaps = itemEndX >= minX - 2 && item.x <= maxX + 2;
        const verticallyOverlaps = item.centerY >= minY - 3 && item.centerY <= maxY + 3;

        return horizontallyOverlaps && verticallyOverlaps;
      })
      .sort((left, right) => left.x - right.x);

    const label = overlappingItems
      .map((item) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return label || undefined;
  }

  private extractPdfHyperlinksFromRawSource(buffer: Buffer): PdfHyperlink[] {
    const pdfSource = buffer.toString('latin1');
    const links: PdfHyperlink[] = [];
    const uriPattern = /\/URI\s*(?:\((?<literal>(?:\\.|[^\\)])*)\)|<(?<hex>[0-9A-Fa-f\s]+)>)/g;

    for (const match of pdfSource.matchAll(uriPattern)) {
      const rawUrl = match.groups?.literal
        ? this.decodePdfLiteralString(match.groups.literal)
        : this.decodePdfHexString(match.groups?.hex ?? '');

      const url = this.normalizeExtractedUrl(rawUrl);
      if (url) {
        links.push({ url });
      }
    }

    return this.uniqueHyperlinksInOrder(links);
  }

  private injectHyperlinksIntoText(text: string, hyperlinks: PdfHyperlink[]): string {
    if (!hyperlinks.length) {
      return text;
    }

    const lines = (text ?? '').split(/\r?\n/);
    const insertedLineIndexes = new Set<number>();
    const unmatchedUrls: string[] = [];

    for (const hyperlink of hyperlinks) {
      const normalizedUrl = this.normalizeExtractedUrl(hyperlink.url);
      if (!normalizedUrl || text.includes(normalizedUrl)) {
        continue;
      }

      const projectTitleIndex = this.findUrlSlugLineIndex(
        lines,
        normalizedUrl,
        insertedLineIndexes,
      );
      if (projectTitleIndex >= 0) {
        lines.splice(projectTitleIndex + 1, 0, normalizedUrl);
        insertedLineIndexes.add(projectTitleIndex);
        continue;
      }

      const label = this.normalizeLinkLabel(hyperlink.label);
      const insertionIndex =
        label && !this.isWeakLinkLabel(label)
          ? this.findLinkLabelLineIndex(lines, label, insertedLineIndexes)
          : -1;

      if (insertionIndex >= 0) {
        lines.splice(insertionIndex + 1, 0, normalizedUrl);
        insertedLineIndexes.add(insertionIndex);
        continue;
      }

      unmatchedUrls.push(normalizedUrl);
    }

    const dedupedUnmatchedUrls = this.uniqueInOrder(unmatchedUrls).filter(
      (url) => !lines.includes(url),
    );

    return [...lines, ...dedupedUnmatchedUrls].join('\n');
  }

  private normalizeLinkLabel(value: string | undefined): string {
    return (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isWeakLinkLabel(normalizedLabel: string): boolean {
    if (WEAK_LINK_LABELS.has(normalizedLabel)) {
      return true;
    }

    return normalizedLabel.length < 4;
  }

  private findUrlSlugLineIndex(
    lines: string[],
    normalizedUrl: string,
    insertedLineIndexes: Set<number>,
  ): number {
    const tokens = this.extractUrlContextTokens(normalizedUrl);
    if (!tokens.length) {
      return -1;
    }

    for (let index = 0; index < lines.length; index += 1) {
      if (insertedLineIndexes.has(index)) {
        continue;
      }

      const normalizedLine = this.normalizeLinkLabel(lines[index]);
      if (!normalizedLine) {
        continue;
      }

      if (tokens.some((token) => normalizedLine.includes(token))) {
        return index;
      }
    }

    return -1;
  }

  private extractUrlContextTokens(url: string): string[] {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname.toLowerCase();
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      const tokens: string[] = [];

      if ((host === 'github.com' || host.endsWith('.github.com')) && pathParts.length >= 2) {
        tokens.push(pathParts[1]);
      } else if (host.endsWith('github.io')) {
        tokens.push(...pathParts);
      }

      return this.uniqueInOrder(
        tokens.map((token) => this.normalizeLinkLabel(token)).filter((token) => token.length >= 4),
      );
    } catch {
      return [];
    }
  }

  private findLinkLabelLineIndex(
    lines: string[],
    normalizedLabel: string,
    insertedLineIndexes: Set<number>,
  ): number {
    for (let index = 0; index < lines.length; index += 1) {
      if (insertedLineIndexes.has(index)) {
        continue;
      }

      const line = lines[index];
      if (this.normalizeLinkLabel(line) === normalizedLabel) {
        return index;
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      if (insertedLineIndexes.has(index)) {
        continue;
      }

      const normalizedLine = this.normalizeLinkLabel(lines[index]);
      if (normalizedLine.includes(normalizedLabel) || normalizedLabel.includes(normalizedLine)) {
        return index;
      }
    }

    return -1;
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
    const cleaned = value
      .trim()
      .replace(/[\0\s]+$/g, '')
      .replace(/[.,;)]+$/g, '');
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

  private uniqueHyperlinksInOrder(links: PdfHyperlink[]): PdfHyperlink[] {
    const seen = new Set<string>();
    const result: PdfHyperlink[] = [];

    for (const link of links) {
      const key = `${link.label ?? ''}|${link.url}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(link);
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
      .replace(/\0/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }
}
