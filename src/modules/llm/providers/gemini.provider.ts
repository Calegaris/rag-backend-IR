import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateStructuredOptions, ILLMProvider } from '../llm.interface';

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

    const modelName =
      options.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'gemini-2.5-flash';

    const temperature =
      options.temperature !== undefined
        ? options.temperature
        : this.configService.get<number>('llm.temperature') ?? 0.1;

    // Detectar automáticamente si la API key es Vertex AI Express Mode (comienza con "AQ.") o Gemini Developer API
    const isVertex = apiKey.startsWith('AQ.');
    const ai = new GoogleGenAI(
      isVertex ? { vertexai: true, apiKey } : { apiKey },
    );

    this.logger.debug(
      `Invocando @google/genai con modelo: ${modelName}, vertexai: ${isVertex}, temp: ${temperature}`,
    );

    const config: any = {
      systemInstruction: options.systemPrompt,
      responseMimeType: 'application/json',
      temperature,
    };

    if (options.jsonSchema) {
      config.responseSchema = options.jsonSchema;
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: options.userPrompt,
      config,
    });

    const text = response.text || '';

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      this.logger.error(
        `Error al parsear JSON devuelto por Gemini. Contenido: ${text}`,
        error,
      );
      throw new Error(
        `La respuesta del modelo Gemini no fue un JSON válido: ${text.substring(0, 200)}...`,
      );
    }
  }
}
