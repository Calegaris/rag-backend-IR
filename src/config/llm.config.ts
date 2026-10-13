import { registerAs } from '@nestjs/config';

export interface LLMConfig {
  provider: 'gemini' | 'claude' | 'openai';
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export default registerAs(
  'llm',
  (): LLMConfig => ({
    provider: (process.env.LLM_PROVIDER as 'gemini' | 'claude' | 'openai') || 'gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.LLM_MODEL || 'gemini-1.5-pro',
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : 4096,
  }),
);
