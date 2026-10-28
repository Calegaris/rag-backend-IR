import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMFactory } from './llm.factory';
import { GeminiProvider } from './providers/gemini.provider';
import { GeminiEmbeddingService } from './providers/gemini-embedding.service';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAIProvider } from './providers/openai.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    LLMFactory,
    GeminiProvider,
    GeminiEmbeddingService,
    ClaudeProvider,
    OpenAIProvider,
  ],
  exports: [
    LLMFactory,
    GeminiProvider,
    GeminiEmbeddingService,
    ClaudeProvider,
    OpenAIProvider,
  ],
})
export class LLMModule {}
export { LLMModule as LlmModule };
