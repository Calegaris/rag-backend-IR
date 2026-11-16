import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

export interface ValidationLogRecord {
  id: string;
  scenarioTitle: string;
  rawInput: string;
  isValid: boolean;
  syntaxErrors: unknown;
  semanticIssues: unknown;
  llmProvider: string | null;
  createdAt: Date;
}

export interface ValidationLogDelegate {
  create: (args: {
    data: {
      id?: string;
      scenarioTitle: string;
      rawInput: string;
      isValid?: boolean;
      syntaxErrors: unknown;
      semanticIssues: unknown;
      llmProvider?: string | null;
      createdAt?: Date | string;
    };
  }) => Promise<ValidationLogRecord>;
  findMany: (args?: {
    take?: number;
    orderBy?: { createdAt?: 'asc' | 'desc' };
  }) => Promise<ValidationLogRecord[]>;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ValidationLog" (
          "id" TEXT NOT NULL,
          "scenarioTitle" TEXT NOT NULL,
          "rawInput" TEXT NOT NULL,
          "isValid" BOOLEAN NOT NULL DEFAULT false,
          "syntaxErrors" JSONB NOT NULL,
          "semanticIssues" JSONB NOT NULL,
          "llmProvider" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ValidationLog_pkey" PRIMARY KEY ("id")
        );
      `);
      await this.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "ValidationLog_createdAt_idx" ON "ValidationLog"("createdAt");
      `);
      this.logger.log('Successfully connected to PostgreSQL database');
    } catch (error) {
      this.logger.error('Failed to connect to database on module init', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL database');
  }
}
