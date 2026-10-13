import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  pgvector: 'ready' | 'not_installed' | 'error';
  timestamp: string;
  error?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    try {
      // 1. Verify PostgreSQL connection and check for the 'vector' extension in pg_extension catalog
      const result: Array<{ extname: string }> = await this.prisma.$queryRaw`
        SELECT extname FROM pg_extension WHERE extname = 'vector';
      `;

      const hasVector = result && result.length > 0 && result[0].extname === 'vector';

      return {
        status: hasVector ? 'ok' : 'error',
        database: 'connected',
        pgvector: hasVector ? 'ready' : 'not_installed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Health check failed', error);
      return {
        status: 'error',
        database: 'disconnected',
        pgvector: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }
}
