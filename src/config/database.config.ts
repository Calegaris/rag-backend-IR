import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
}

export default registerAs(
  'database',
  (): DatabaseConfig => ({
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5433/rag_escenarios_lel?schema=public',
  }),
);
