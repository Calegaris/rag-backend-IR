import { registerAs } from '@nestjs/config';

export interface EmbeddingConfig {
  provider: 'sentence-transformers' | 'openai' | 'google';
  model: string;
  dimension: number;
}

export default registerAs(
  'embedding',
  (): EmbeddingConfig => ({
    provider: (process.env.EMBEDDING_PROVIDER as 'sentence-transformers' | 'openai' | 'google') || 'sentence-transformers',
    model: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
    dimension: process.env.EMBEDDING_DIMENSION ? parseInt(process.env.EMBEDDING_DIMENSION, 10) : 384,
  }),
);
