// Pools GPT/Groq/Cerebras (OpenAI-compatible chat APIs) behind one client,
// falling back across providers on failure and continuing truncated responses.
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { KeyRotator } from './key-rotator.util';

const MAX_CONTINUATIONS = 3;
const CONTINUATION_INSTRUCTION =
  'Continue exactly where you left off. Do not repeat any text already written, and do not add any preamble.';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProviderPool {
  name: string;
  baseUrl: string;
  model: string;
  rotator: KeyRotator;
}

interface OpenAiCompatibleResponse {
  choices: Array<{ message: { content: string | null }; finish_reason: string }>;
}

interface CompletionResult {
  text: string;
  finishReason: string;
  provider: string;
}

@Injectable()
export class MultiProviderCompletionService {
  private readonly logger = new Logger(MultiProviderCompletionService.name);
  private readonly pools: ProviderPool[];

  // Builds one KeyRotator-backed pool per provider (GPT/Groq/Cerebras) and drops any with no configured keys.
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const candidates: ProviderPool[] = [
      {
        name: 'gpt',
        baseUrl: this.configService.get<string>('llmProviders.gpt.baseUrl') ?? '',
        model: this.configService.get<string>('llmProviders.gpt.model') ?? '',
        rotator: new KeyRotator(this.configService.get<string[]>('llmProviders.gpt.apiKeys') ?? []),
      },
      {
        name: 'groq',
        baseUrl: this.configService.get<string>('llmProviders.groq.baseUrl') ?? '',
        model: this.configService.get<string>('llmProviders.groq.model') ?? '',
        rotator: new KeyRotator(this.configService.get<string[]>('llmProviders.groq.apiKeys') ?? []),
      },
      {
        name: 'cerebras',
        baseUrl: this.configService.get<string>('llmProviders.cerebras.baseUrl') ?? '',
        model: this.configService.get<string>('llmProviders.cerebras.model') ?? '',
        rotator: new KeyRotator(this.configService.get<string[]>('llmProviders.cerebras.apiKeys') ?? []),
      },
    ];
    this.pools = candidates.filter((pool) => pool.rotator.hasKeys());
  }

  // Makes a single chat-completion request against one provider pool; used by callWithFallback.
  private async callOnce(
    pool: ProviderPool,
    messages: ChatMessage[],
    maxTokens?: number,
  ): Promise<CompletionResult> {
    const apiKey = pool.rotator.next();
    const response = await firstValueFrom(
      this.httpService.post<OpenAiCompatibleResponse>(
        `${pool.baseUrl}/chat/completions`,
        { model: pool.model, messages, ...(maxTokens ? { max_tokens: maxTokens } : {}) },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      ),
    );
    const choice = response.data.choices[0];
    return { text: choice.message.content ?? '', finishReason: choice.finish_reason, provider: pool.name };
  }

  // Retries callOnce across all provider pools/keys until one succeeds; used by generate().
  private async callWithFallback(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    let lastError: unknown;
    for (const pool of this.pools) {
      for (let attempt = 0; attempt < pool.rotator.size(); attempt++) {
        try {
          return await this.callOnce(pool, messages, maxTokens);
        } catch (error) {
          lastError = error;
          const message = error instanceof AxiosError ? (error.response?.data ?? error.message) : error;
          this.logger.warn(`Provider ${pool.name} failed on 1 key, trying next: ${JSON.stringify(message)}`);
        }
      }
    }
    throw new Error(`All completion providers failed: ${String(lastError)}`);
  }

  // Called by job-description-classifier.service.ts and interview-question-generator.service.ts to get an LLM completion, auto-continuing truncated responses.
  async generate(prompt: string, maxTokens?: number): Promise<string> {
    if (this.pools.length === 0) {
      throw new Error('No completion providers configured (GPT_API_KEY_1..4 / GROQ_API_KEY_1..4 / CEREBRAS_API_KEY_1..4)');
    }

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    let result = await this.callWithFallback(messages, maxTokens);
    let fullText = result.text;

    let continuations = 0;
    while (result.finishReason === 'length' && continuations < MAX_CONTINUATIONS) {
      continuations += 1;
      messages.push({ role: 'assistant', content: result.text });
      messages.push({ role: 'user', content: CONTINUATION_INSTRUCTION });
      result = await this.callWithFallback(messages, maxTokens);
      fullText += result.text;
    }

    return fullText;
  }
}
