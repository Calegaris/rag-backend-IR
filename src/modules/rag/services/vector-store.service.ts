import { Injectable } from '@nestjs/common';
import { DocumentScope, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocType } from '../dto/rag-search.dto';

export { DocType };

export interface VectorChunkInput {
  content: string;
  vector: number[];
  metadata?: Record<string, any>;
}

export interface StoreDocumentParams {
  title: string;
  type: DocType | DocumentScope | string;
  content: string;
  filePath?: string;
  chunks: VectorChunkInput[];
}

export interface SimilaritySearchOptions {
  type?: DocType | DocumentScope | string;
  projectName?: string;
  topK?: number;
  minSimilarity?: number;
}

export interface SimilaritySearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  docType: DocType;
  content: string;
  metadata: Record<string, any> | null;
  similarity: number;
}

export interface IndexedLelProjectStat {
  projectName: string;
  documentId: string;
  title: string;
  symbolsCount: number;
  uploadedAt: Date | string;
}

export interface RagStatsResponse {
  totalDocuments: number;
  totalEmbeddings: number;
  byType: {
    MARCO_TEORICO: {
      documents: number;
      embeddings: number;
    };
    LEL: {
      documents: number;
      embeddings: number;
    };
  };
  projects?: IndexedLelProjectStat[];
}

@Injectable()
export class VectorStoreService {
  constructor(private readonly prisma: PrismaService) {}

  toDocumentScope(type: DocType | DocumentScope | string): DocumentScope {
    const normalized = String(type).toUpperCase().trim();
    if (
      normalized === DocType.MARCO_TEORICO ||
      normalized === DocumentScope.METODOLOGIA
    ) {
      return DocumentScope.METODOLOGIA;
    }
    if (
      normalized === DocType.LEL ||
      normalized === DocumentScope.LEL_DOMINIO
    ) {
      return DocumentScope.LEL_DOMINIO;
    }
    if (normalized === DocumentScope.ESCENARIOS_REF) {
      return DocumentScope.ESCENARIOS_REF;
    }
    return DocumentScope.METODOLOGIA;
  }

  toDocType(scope: DocumentScope | string): DocType {
    const normalized = String(scope).toUpperCase().trim();
    if (normalized === DocumentScope.LEL_DOMINIO || normalized === DocType.LEL) {
      return DocType.LEL;
    }
    return DocType.MARCO_TEORICO;
  }

  async storeDocumentWithEmbeddings(
    params: StoreDocumentParams,
  ): Promise<{ documentId: string; chunksStored: number }> {
    const scope = this.toDocumentScope(params.type);

    // Ensure idempotency: remove previous document with same title and scope (cascade deletes embeddings)
    await this.prisma.document.deleteMany({
      where: {
        title: params.title,
        scope,
      },
    });

    const document = await this.prisma.document.create({
      data: {
        title: params.title,
        scope,
        content: params.content,
        filePath: params.filePath,
      },
    });

    for (const chunk of params.chunks) {
      const id = randomUUID();
      const vectorString = `[${chunk.vector.join(',')}]`;
      const metadataJson = JSON.stringify(chunk.metadata ?? {});

      await this.prisma.$executeRaw`
        INSERT INTO "Embedding" ("id", "documentId", "content", "vector", "metadata", "createdAt")
        VALUES (${id}, ${document.id}, ${chunk.content}, ${vectorString}::vector, ${metadataJson}::jsonb, NOW())
      `;
    }

    return {
      documentId: document.id,
      chunksStored: params.chunks.length,
    };
  }

  async similaritySearch(
    queryVector: number[],
    options?: SimilaritySearchOptions,
  ): Promise<SimilaritySearchResult[]> {
    const vectorString = `[${queryVector.join(',')}]`;
    const topK = options?.topK ?? 5;
    const minSimilarity = options?.minSimilarity;
    const scope = options?.type
      ? this.toDocumentScope(options.type)
      : undefined;
    const projectName = options?.projectName?.trim();

    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    if (scope) {
      conditions.push(Prisma.sql`d."scope" = ${scope}::"DocumentScope"`);
    }

    if (projectName) {
      conditions.push(
        Prisma.sql`e."metadata"->>'projectName' = ${projectName}`,
      );
    }

    if (minSimilarity !== undefined && minSimilarity !== null) {
      conditions.push(
        Prisma.sql`(1 - (e."vector" <=> ${vectorString}::vector)) >= ${minSimilarity}`,
      );
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        documentId: string;
        documentTitle: string;
        scope: string;
        content: string;
        metadata: Record<string, any> | null;
        similarity: number;
      }>
    >`
      SELECT
        e."id",
        e."documentId",
        d."title" AS "documentTitle",
        d."scope"::text AS "scope",
        e."content",
        e."metadata",
        1 - (e."vector" <=> ${vectorString}::vector) AS "similarity"
      FROM "Embedding" e
      INNER JOIN "Document" d ON d."id" = e."documentId"
      WHERE ${whereClause}
      ORDER BY e."vector" <=> ${vectorString}::vector ASC
      LIMIT ${topK}
    `;

    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      docType: this.toDocType(row.scope),
      content: row.content,
      metadata: row.metadata,
      similarity: Number(row.similarity),
    }));
  }

  async getStats(): Promise<RagStatsResponse> {
    const findManyFn = (this.prisma.document as any)?.findMany;
    const lelDocumentsPromise: Promise<any[]> =
      typeof findManyFn === 'function'
        ? this.prisma.document.findMany({
            where: { scope: DocumentScope.LEL_DOMINIO },
            include: {
              _count: { select: { embeddings: true } },
              embeddings: { take: 1, select: { metadata: true } },
            },
            orderBy: { uploadedAt: 'desc' },
          })
        : Promise.resolve([]);

    const [
      marcoDocs,
      marcoEmbeddings,
      lelDocs,
      lelEmbeddings,
      lelDocuments,
    ] = await Promise.all([
      this.prisma.document.count({
        where: { scope: DocumentScope.METODOLOGIA },
      }),
      this.prisma.embedding.count({
        where: { document: { scope: DocumentScope.METODOLOGIA } },
      }),
      this.prisma.document.count({
        where: { scope: DocumentScope.LEL_DOMINIO },
      }),
      this.prisma.embedding.count({
        where: { document: { scope: DocumentScope.LEL_DOMINIO } },
      }),
      lelDocumentsPromise,
    ]);

    const projects: IndexedLelProjectStat[] = Array.isArray(lelDocuments)
      ? lelDocuments.map((doc) => ({
          projectName:
            (doc.embeddings?.[0]?.metadata as any)?.projectName ||
            String(doc.title || '')
              .replace(/^LEL\s*-\s*/i, '')
              .trim() ||
            doc.title,
          documentId: doc.id,
          title: doc.title,
          symbolsCount: doc._count?.embeddings ?? 0,
          uploadedAt: doc.uploadedAt,
        }))
      : [];

    return {
      totalDocuments: marcoDocs + lelDocs,
      totalEmbeddings: marcoEmbeddings + lelEmbeddings,
      byType: {
        MARCO_TEORICO: {
          documents: marcoDocs,
          embeddings: marcoEmbeddings,
        },
        LEL: {
          documents: lelDocs,
          embeddings: lelEmbeddings,
        },
      },
      projects,
    };
  }
}
