import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const EMBEDDING_MODELS = [
  'gemini-embedding-2',
  'gemini-embedding-001',
] as const;

export const TARGET_EMBEDDING_DIMENSION = 384;

@Injectable()
export class GeminiEmbeddingService {
  private readonly logger = new Logger(GeminiEmbeddingService.name);

  constructor(private readonly configService: ConfigService) {}

  async embedText(text: string, apiKey?: string): Promise<number[]> {
    const resolvedApiKey =
      apiKey ||
      this.configService.get<string>('llm.geminiApiKey') ||
      this.configService.get<string>('llm.apiKey') ||
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env.GEMINI_API_KEY;

    if (!resolvedApiKey) {
      throw new Error(
        'Gemini API Key is not configured. Define GEMINI_API_KEY in .env or provide the x-llm-api-key header.',
      );
    }

    const ai = new GoogleGenAI({ apiKey: resolvedApiKey });
    let lastError: unknown = null;

    for (let i = 0; i < EMBEDDING_MODELS.length; i++) {
      const model = EMBEDDING_MODELS[i];
      try {
        const response: any = await ai.models.embedContent({
          model,
          contents: text,
          config: {
            outputDimensionality: TARGET_EMBEDDING_DIMENSION,
          },
        });

        const rawValues: number[] | undefined =
          response?.embeddings?.[0]?.values ?? response?.embedding?.values;

        if (!Array.isArray(rawValues) || rawValues.length === 0) {
          throw new Error(
            `Gemini embedding model '${model}' returned an empty vector.`,
          );
        }

        const resized = this.resizeToDimension(
          rawValues,
          TARGET_EMBEDDING_DIMENSION,
        );
        return this.normalizeL2(resized);
      } catch (error: any) {
        lastError = error;
        const isFallback = this.isFallbackError(error);
        const hasNextModel = i + 1 < EMBEDDING_MODELS.length;

        if (isFallback && hasNextModel) {
          const nextModel = EMBEDDING_MODELS[i + 1];
          const delayMs = this.getFallbackDelayMs();
          this.logger.warn(
            `Embedding model '${model}' unavailable (${error?.message || error?.status || error?.code}). Waiting ${delayMs}ms before retrying with '${nextModel}'...`,
          );
          if (delayMs > 0) {
            await this.sleep(delayMs);
          }
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  async embedBatch(texts: string[], apiKey?: string): Promise<number[][]> {
    const results: number[][] = [];
    const delayMs = this.getBatchItemDelayMs();

    for (let i = 0; i < texts.length; i++) {
      const vector = await this.embedText(texts[i], apiKey);
      results.push(vector);

      if (i + 1 < texts.length && delayMs > 0) {
        await this.sleep(delayMs);
      }
    }

    return results;
  }

  normalizeL2(vector: number[]): number[] {
    let sumSquares = 0;
    for (let i = 0; i < vector.length; i++) {
      sumSquares += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSquares);
    if (norm === 0) {
      return [...vector];
    }
    return vector.map((v) => v / norm);
  }

  private resizeToDimension(vector: number[], targetDim: number): number[] {
    if (vector.length === targetDim) {
      return [...vector];
    }
    if (vector.length > targetDim) {
      return vector.slice(0, targetDim);
    }
    const padded = [...vector];
    while (padded.length < targetDim) {
      padded.push(0);
    }
    return padded;
  }

  private isFallbackError(error: any): boolean {
    if (!error) return false;
    const status = error.status ?? error.code ?? error.statusCode;
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
    const msg = `${error.message || ''} ${error.statusText || ''}`;
    return (
      /\b(503|429|404|400)\b/.test(msg) ||
      /UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|INVALID_ARGUMENT|unsupported/i.test(
        msg,
      )
    );
  }

  private getFallbackDelayMs(): number {
    return process.env.NODE_ENV === 'test' ? 0 : 1000;
  }

  private getBatchItemDelayMs(): number {
    return process.env.NODE_ENV === 'test' ? 0 : 150;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

