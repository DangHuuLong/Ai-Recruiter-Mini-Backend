// Wires the Gemini embedding service and multi-provider completion service.
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { GeminiEmbeddingService } from './gemini-embedding.service';
import { MultiProviderCompletionService } from './multi-provider-completion.service';

@Module({
  imports: [HttpModule.register({ timeout: 60000 })],
  providers: [GeminiEmbeddingService, MultiProviderCompletionService],
  exports: [GeminiEmbeddingService, MultiProviderCompletionService],
})
export class LlmProvidersModule {}
