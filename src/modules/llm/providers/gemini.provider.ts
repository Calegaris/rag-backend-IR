import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateStructuredOptions, ILLMProvider } from '../llm.interface';

export const GEMINI_FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-flash-lite-latest',
  'gemini-omni-1.1-flash',
  'gemma-4-31b-it',
];

@Injectable()
export class GeminiProvider implements ILLMProvider {
  readonly providerName = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateStructured<T>(options: GenerateStructuredOptions): Promise<T> {
    const apiKey =
      options.apiKeyOverride ||
      this.configService.get<string>('llm.apiKey') ||
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Gemini API Key no configurada. Defina GEMINI_API_KEY en .env o envíe el header x-llm-api-key.',
      );
    }

    const initialModel =
      options.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'gemini-3.6-flash';

    const temperature =
      options.temperature !== undefined
        ? options.temperature
        : this.configService.get<number>('llm.temperature') ?? 0.1;

    const ai = new GoogleGenAI({ apiKey });

    const modelsToTry = [
      initialModel,
      ...GEMINI_FALLBACK_MODELS.filter((m) => m !== initialModel),
    ];

    let lastError: any = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const isGemma = currentModel.startsWith('gemma-');

      let contents: any = options.userPrompt;
      const config: any = {
        temperature,
      };

      if (isGemma) {
        contents = `${options.systemPrompt}\n\n${options.userPrompt}`;
      } else {
        config.systemInstruction = options.systemPrompt;
        config.responseMimeType = 'application/json';
        if (options.jsonSchema) {
          config.responseSchema = options.jsonSchema;
        }
      }

      try {
        this.logger.debug(
          `Invocando @google/genai con modelo: ${currentModel}, temp: ${temperature}`,
        );

        const response = await ai.models.generateContent({
          model: currentModel,
          contents,
          config,
        });

        const rawText = response.text || '';
        const cleanedText = this.cleanJsonText(rawText);

        try {
          return JSON.parse(cleanedText) as T;
        } catch (error) {
          this.logger.error(
            `Error al parsear JSON devuelto por Gemini (${currentModel}). Contenido: ${cleanedText}`,
            error,
          );
          throw new Error(
            `La respuesta del modelo Gemini (${currentModel}) no fue un JSON válido: ${cleanedText.substring(0, 200)}...`,
          );
        }
      } catch (error: any) {
        lastError = error;
        const isFallback = this.isFallbackError(error);
        const hasNextModel = i + 1 < modelsToTry.length;

        if (isFallback && hasNextModel) {
          const nextModel = modelsToTry[i + 1];
          const delay = this.getBackoffMs();
          this.logger.warn(
            `Modelo '${currentModel}' no disponible (${error.message || error.status || error.code}). Esperando ${delay}ms para reintentar con fallback '${nextModel}'...`,
          );
          if (delay > 0) {
            await this.sleep(delay);
          }
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  private isFallbackError(error: any): boolean {
    if (!error) return false;
    const status = error.status || error.code || error.statusCode;
    if (
      status === 503 ||
      status === 429 ||
      status === 404 ||
      status === 400 ||
      status === '503' ||
      status === '429' ||
      status === '404' ||
      status === '400'
    ) {
      return true;
    }
    const msg = String(error.message || '') + ' ' + String(error.statusText || '');
    return (
      /\b(503|429|404|400)\b/.test(msg) ||
      /UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|INVALID_ARGUMENT|unsupported/i.test(msg)
    );
  }

  private getBackoffMs(): number {
    return process.env.NODE_ENV === 'test' ? 0 : 1200;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private cleanJsonText(rawText: string): string {
    let cleaned = rawText.trim();
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return cleaned;
  }
}
