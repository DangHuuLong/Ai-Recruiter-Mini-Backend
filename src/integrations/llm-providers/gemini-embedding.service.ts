import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { KeyRotator } from './key-rotator.util';

interface GeminiEmbedResponse {
  embedding: { values: number[] };
}

// Must match the InterviewQuestionEntry.embedding column (vector(768) in
// prisma/schema.prisma). gemini-embedding-001 natively outputs 3072 dims
// but supports Matryoshka truncation via outputDimensionality — 768 keeps
// the column size already committed rather than requiring a new migration.
export const EMBEDDING_DIMENSIONS = 768;

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);
  private readonly rotator: KeyRotator;
  private readonly model: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.rotator = new KeyRotator(this.configService.get<string[]>('llmProviders.gemini.apiKeys') ?? []);
    this.model = this.configService.get<string>('llmProviders.gemini.embeddingModel') ?? 'gemini-embedding-001';
  }

  /** Embeds text via Gemini, rotating to the next key on failure until every configured key has been tried once. */
  async embed(text: string): Promise<number[]> {
    if (!this.rotator.hasKeys()) {
      throw new Error('No Gemini API keys configured (GEMINI_API_KEY_1..4)');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < this.rotator.size(); attempt++) {
      const apiKey = this.rotator.next();
      try {
        const response = await firstValueFrom(
          this.httpService.post<GeminiEmbedResponse>(
            `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${apiKey}`,
            { content: { parts: [{ text }] }, outputDimensionality: EMBEDDING_DIMENSIONS },
          ),
        );
        return response.data.embedding.values;
      } catch (error) {
        lastError = error;
        const message = error instanceof AxiosError ? error.response?.data ?? error.message : error;
        this.logger.warn(`Gemini embedding call failed on 1 key, trying next: ${JSON.stringify(message)}`);
      }
    }

    throw new Error(`All Gemini API keys failed for embedding: ${String(lastError)}`);
  }
}
