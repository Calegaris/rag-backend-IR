import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateStructuredOptions, ILLMProvider } from '../llm.interface';

@Injectable()
export class ClaudeProvider implements ILLMProvider {
  readonly providerName = 'claude';
  private readonly logger = new Logger(ClaudeProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateStructured<T>(options: GenerateStructuredOptions): Promise<T> {
    const apiKey =
      options.apiKeyOverride ||
      this.configService.get<string>('ANTHROPIC_API_KEY') ||
      process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Anthropic API Key no configurada. Defina ANTHROPIC_API_KEY en .env o envíe el header x-llm-api-key.',
      );
    }

    const modelName =
      options.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'claude-3-5-sonnet-20241022';

    this.logger.warn(
      `ClaudeProvider invocado para modelo ${modelName}. Integración directa con @anthropic-ai/sdk preparada para extensión.`,
    );

    // Si se requiere en el futuro, se puede integrar @anthropic-ai/sdk o llamada HTTP con tool_use
    throw new NotImplementedException(
      'El proveedor Claude está preparado conceptualmente. Configure LLM_PROVIDER=gemini para la fase actual.',
    );
  }
}
