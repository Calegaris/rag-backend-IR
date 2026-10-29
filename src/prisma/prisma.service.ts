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

  declare validationLog: PrismaClient extends { validationLog: infer T }
    ? T
    : ValidationLogDelegate;

  constructor() {
    super();
    if (!(this as unknown as { validationLog?: unknown }).validationLog) {
      (this as unknown as { validationLog: ValidationLogDelegate }).validationLog = {
        create: async ({ data }) => {
          const id = data.id || crypto.randomUUID();
          const isValid = Boolean(data.isValid);
          const syntaxJson = JSON.stringify(data.syntaxErrors ?? []);
          const semanticJson = JSON.stringify(data.semanticIssues ?? []);
          const llmProvider = data.llmProvider ?? null;
          const rows = await this.$queryRaw<ValidationLogRecord[]>`
            INSERT INTO "ValidationLog" (
              "id",
              "scenarioTitle",
              "rawInput",
              "isValid",
              "syntaxErrors",
              "semanticIssues",
              "llmProvider",
              "createdAt"
            )
            VALUES (
              ${id},
              ${data.scenarioTitle},
              ${data.rawInput},
              ${isValid},
              ${syntaxJson}::jsonb,
              ${semanticJson}::jsonb,
              ${llmProvider},
              NOW()
            )
            RETURNING
              "id",
              "scenarioTitle",
              "rawInput",
              "isValid",
              "syntaxErrors",
              "semanticIssues",
              "llmProvider",
              "createdAt"
          `;
          return (
            rows[0] ?? {
              id,
              scenarioTitle: data.scenarioTitle,
              rawInput: data.rawInput,
              isValid,
              syntaxErrors: data.syntaxErrors,
              semanticIssues: data.semanticIssues,
              llmProvider,
              createdAt: new Date(),
            }
          );
        },
        findMany: async (args) => {
          const take = Math.min(Math.max(args?.take ?? 20, 1), 100);
          if (args?.orderBy?.createdAt === 'asc') {
            return this.$queryRaw<ValidationLogRecord[]>`
              SELECT
                "id",
                "scenarioTitle",
                "rawInput",
                "isValid",
                "syntaxErrors",
                "semanticIssues",
                "llmProvider",
                "createdAt"
              FROM "ValidationLog"
              ORDER BY "createdAt" ASC
              LIMIT ${take}
            `;
          }
          return this.$queryRaw<ValidationLogRecord[]>`
            SELECT
              "id",
              "scenarioTitle",
              "rawInput",
              "isValid",
              "syntaxErrors",
              "semanticIssues",
              "llmProvider",
              "createdAt"
            FROM "ValidationLog"
            ORDER BY "createdAt" DESC
            LIMIT ${take}
          `;
        },
      };
    }
  }

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
