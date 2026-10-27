import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMFactory } from './llm.factory';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAIProvider } from './providers/openai.provider';

@Module({
  imports: [ConfigModule],
  providers: [LLMFactory, GeminiProvider, ClaudeProvider, OpenAIProvider],
  exports: [LLMFactory, GeminiProvider, ClaudeProvider, OpenAIProvider],
})
export class LLMModule {}
