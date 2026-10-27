import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateStructuredOptions, ILLMProvider } from '../llm.interface';

@Injectable()
export class OpenAIProvider implements ILLMProvider {
  readonly providerName = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateStructured<T>(options: GenerateStructuredOptions): Promise<T> {
    const apiKey =
      options.apiKeyOverride ||
      this.configService.get<string>('OPENAI_API_KEY') ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API Key no configurada. Defina OPENAI_API_KEY en .env o envíe el header x-llm-api-key.',
      );
    }

    const modelName =
      options.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'gpt-4o-mini';

    this.logger.warn(
      `OpenAIProvider invocado para modelo ${modelName}. Integración directa con openai sdk preparada para extensión.`,
    );

    // Preparado para response_format: { type: "json_object" } o structured outputs
    throw new NotImplementedException(
      'El proveedor OpenAI está preparado conceptualmente. Configure LLM_PROVIDER=gemini para la fase actual.',
    );
  }
}
