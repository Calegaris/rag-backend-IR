import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  EMBEDDING_MODELS,
  GeminiEmbeddingService,
  TARGET_EMBEDDING_DIMENSION,
} from './gemini-embedding.service';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
}));

describe('GeminiEmbeddingService', () => {
  let service: GeminiEmbeddingService;
  let mockEmbedContent: jest.Mock;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    mockEmbedContent = jest.fn();
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: {
        embedContent: mockEmbedContent,
      },
    }));

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'llm.apiKey' || key === 'GEMINI_API_KEY') {
          return 'test-gemini-api-key';
        }
        return undefined;
      }),
    };

    service = new GeminiEmbeddingService(mockConfigService as ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a 384-dimensional L2-normalized vector', async () => {
    const rawVector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 3 : i === 1 ? 4 : 0));
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: rawVector }],
    });

    const result = await service.embedText('Símbolo LEL: Escribiente');

    expect(result).toHaveLength(TARGET_EMBEDDING_DIMENSION);
    expect(result[0]).toBeCloseTo(0.6, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);

    const norm = Math.sqrt(result.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: EMBEDDING_MODELS[0],
      contents: 'Símbolo LEL: Escribiente',
      config: { outputDimensionality: 384 },
    });
  });

  it('should truncate vectors larger than 384 dimensions and normalize them', async () => {
    const rawVector768 = Array.from({ length: 768 }, () => 1);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: rawVector768 }],
    });

    const result = await service.embedText('Texto largo');

    expect(result).toHaveLength(384);
    const norm = Math.sqrt(result.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it('should fallback from gemini-embedding-2 to gemini-embedding-001 on 503/429/404 errors', async () => {
    const error503: any = new Error('Service Unavailable');
    error503.status = 503;

    const validVector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));

    mockEmbedContent
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce({
        embeddings: [{ values: validVector }],
      });

    const result = await service.embedText('Texto con fallback');

    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
    expect(mockEmbedContent.mock.calls[0][0].model).toBe('gemini-embedding-2');
    expect(mockEmbedContent.mock.calls[1][0].model).toBe('gemini-embedding-001');
    expect(result).toHaveLength(384);
    expect(result[0]).toBeCloseTo(1.0, 5);
  });

  it('should process embedBatch sequentially and return normalized vectors', async () => {
    const validVector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: validVector }],
    });

    const batch = await service.embedBatch(['Chunk 1', 'Chunk 2', 'Chunk 3']);

    expect(batch).toHaveLength(3);
    expect(mockEmbedContent).toHaveBeenCalledTimes(3);
    expect(batch[0]).toHaveLength(384);
  });
});

