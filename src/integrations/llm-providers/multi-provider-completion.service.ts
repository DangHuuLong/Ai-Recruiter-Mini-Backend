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

// Pools GPT/Groq/Cerebras (all OpenAI-compatible chat completion APIs)
// behind one client. Two resilience mechanisms, both driven by rotating
// through the combined set of provider keys:
//  - fallback: if a call throws (auth/rate-limit/network), try the next
//    configured provider.
//  - continuation: if a response is cut off (finish_reason=length), resend
//    the conversation with a "continue" instruction — using whichever
//    provider/key comes up next in rotation — until it finishes naturally
//    or MAX_CONTINUATIONS is hit.
@Injectable()
export class MultiProviderCompletionService {
  private readonly logger = new Logger(MultiProviderCompletionService.name);
  private readonly pools: ProviderPool[];

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

  private async callWithFallback(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    let lastError: unknown;
    for (const pool of this.pools) {
      // Retry every key in this provider's pool before giving up on the
      // provider entirely — a single dead/expired key must not waste the
      // other 3 (confirmed with a real dead GROQ_API_KEY_1 during testing).
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

  /**
   * Generates text, automatically continuing across providers/keys if a response gets cut off mid-way.
   * `maxTokens` caps each individual call — pass a small value to force continuation on a long answer.
   */
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
