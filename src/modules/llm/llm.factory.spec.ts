import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LLMFactory } from './llm.factory';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAIProvider } from './providers/openai.provider';

describe('LLMFactory', () => {
  let factory: LLMFactory;
  let mockGeminiProvider: Partial<GeminiProvider>;
  let mockClaudeProvider: Partial<ClaudeProvider>;
  let mockOpenAIProvider: Partial<OpenAIProvider>;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    mockGeminiProvider = { providerName: 'gemini', generateStructured: jest.fn() };
    mockClaudeProvider = { providerName: 'claude', generateStructured: jest.fn() };
    mockOpenAIProvider = { providerName: 'openai', generateStructured: jest.fn() };
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'llm.provider') return 'gemini';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMFactory,
        { provide: GeminiProvider, useValue: mockGeminiProvider },
        { provide: ClaudeProvider, useValue: mockClaudeProvider },
        { provide: OpenAIProvider, useValue: mockOpenAIProvider },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    factory = module.get<LLMFactory>(LLMFactory);
  });

  it('debe resolverse correctamente', () => {
    expect(factory).toBeDefined();
  });

  it('debe devolver GeminiProvider por defecto o cuando se especifica "gemini"', () => {
    const provider = factory.getProvider('gemini');
    expect(provider.providerName).toBe('gemini');
  });

  it('debe devolver ClaudeProvider cuando se especifica "claude" o "anthropic"', () => {
    const providerClaude = factory.getProvider('claude');
    expect(providerClaude.providerName).toBe('claude');

    const providerAnthropic = factory.getProvider('anthropic');
    expect(providerAnthropic.providerName).toBe('claude');
  });

  it('debe devolver OpenAIProvider cuando se especifica "openai"', () => {
    const provider = factory.getProvider('openai');
    expect(provider.providerName).toBe('openai');
  });

  it('debe hacer fallback a GeminiProvider ante un proveedor no reconocido', () => {
    const provider = factory.getProvider('unsupported-provider');
    expect(provider.providerName).toBe('gemini');
  });
});
