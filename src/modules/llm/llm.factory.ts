import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider } from './llm.interface';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAIProvider } from './providers/openai.provider';

@Injectable()
export class LLMFactory {
  private readonly logger = new Logger(LLMFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiProvider: GeminiProvider,
    private readonly claudeProvider: ClaudeProvider,
    private readonly openAIProvider: OpenAIProvider,
  ) {}

  getProvider(providerOverride?: string): ILLMProvider {
    const provider = (
      providerOverride ||
      this.configService.get<string>('llm.provider') ||
      process.env.LLM_PROVIDER ||
      'gemini'
    ).toLowerCase();

    switch (provider) {
      case 'gemini':
        return this.geminiProvider;
      case 'claude':
      case 'anthropic':
        return this.claudeProvider;
      case 'openai':
        return this.openAIProvider;
      default:
        this.logger.warn(
          `Proveedor desconocido '${provider}'. Usando Gemini por defecto.`,
        );
        return this.geminiProvider;
    }
  }
}
