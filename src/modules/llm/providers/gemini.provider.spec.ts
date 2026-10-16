import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './gemini.provider';
import { GoogleGenAI } from '@google/genai';

jest.mock('@google/genai');

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let mockConfigService: Partial<ConfigService>;
  let mockGenerateContent: jest.Mock;

  beforeEach(async () => {
    mockGenerateContent = jest.fn();
    (GoogleGenAI as unknown as jest.Mock).mockImplementation((opts: any) => ({
      models: {
        generateContent: mockGenerateContent,
      },
      _opts: opts,
    }));

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'llm.apiKey') return 'AIzaSyStandardKey123';
        if (key === 'llm.model') return 'gemini-2.5-flash';
        if (key === 'llm.temperature') return 0.1;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiProvider,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get<GeminiProvider>(GeminiProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(provider).toBeDefined();
    expect(provider.providerName).toBe('gemini');
  });

  it('debe inicializar GoogleGenAI estándar con keys regulares de Google AI Studio', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ok: true }),
    });

    const res = await provider.generateStructured<{ ok: boolean }>({
      systemPrompt: 'System',
      userPrompt: 'User',
      apiKeyOverride: 'AIzaSyNormalKey',
    });

    expect(res).toEqual({ ok: true });
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'AIzaSyNormalKey' });
  });

  it('debe inicializar GoogleGenAI con { apiKey } independientemente del prefijo de la key', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ok: true }),
    });

    const res = await provider.generateStructured<{ ok: boolean }>({
      systemPrompt: 'System',
      userPrompt: 'User',
      apiKeyOverride: 'AQ.Ab8RN6ILZZhfNP6whZbSSso9zEfGoq7DKD7I6Fs0uFhcZad-vwQUI',
    });

    expect(res).toEqual({ ok: true });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'AQ.Ab8RN6ILZZhfNP6whZbSSso9zEfGoq7DKD7I6Fs0uFhcZad-vwQUI',
    });
  });

  it('debe lanzar excepción si no hay API key configurada', async () => {
    (mockConfigService.get as jest.Mock).mockReturnValue(null);
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    await expect(
      provider.generateStructured({
        systemPrompt: 'Sys',
        userPrompt: 'Usr',
      }),
    ).rejects.toThrow('Gemini API Key no configurada');

    if (prevKey) process.env.GEMINI_API_KEY = prevKey;
  });

  it('debe lanzar excepción descriptiva si el modelo devuelve un JSON inválido', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Texto no JSON de respuesta',
    });

    await expect(
      provider.generateStructured({
        systemPrompt: 'Sys',
        userPrompt: 'Usr',
        apiKeyOverride: 'test-key',
      }),
    ).rejects.toThrow('La respuesta del modelo Gemini no fue un JSON válido');
  });
});
