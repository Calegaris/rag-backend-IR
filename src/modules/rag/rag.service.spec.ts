import { BadRequestException } from '@nestjs/common';
import { GeminiEmbeddingService } from '../llm/providers/gemini-embedding.service';
import { DocType } from './dto/rag-search.dto';
import { RagService } from './rag.service';
import { ChunkingService } from './services/chunking.service';
import { VectorStoreService } from './services/vector-store.service';

describe('RagService', () => {
  let ragService: RagService;
  let chunkingService: ChunkingService;
  let mockVectorStore: jest.Mocked<Partial<VectorStoreService>>;
  let mockEmbeddingService: jest.Mocked<Partial<GeminiEmbeddingService>>;

  const dummyVector = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));

  beforeEach(() => {
    chunkingService = new ChunkingService();

    mockVectorStore = {
      storeDocumentWithEmbeddings: jest
        .fn()
        .mockImplementation(async (params) => ({
          documentId: 'doc-mock-id',
          chunksStored: params.chunks.length,
        })),
      similaritySearch: jest.fn().mockResolvedValue([
        {
          id: 'emb-1',
          documentId: 'doc-1',
          documentTitle: 'Reglas de Episodios y Restricciones en Escenarios',
          docType: DocType.MARCO_TEORICO,
          content: '[Marco Teórico: ...] Los episodios deben redactarse en presente indicativo.',
          metadata: { sourceType: 'MARCO_TEORICO' },
          similarity: 0.89,
        },
      ]),
      getStats: jest.fn().mockResolvedValue({
        totalDocuments: 8,
        totalEmbeddings: 45,
        byType: {
          MARCO_TEORICO: { documents: 7, embeddings: 28 },
          LEL: { documents: 1, embeddings: 17 },
        },
      }),
    };

    mockEmbeddingService = {
      embedText: jest.fn().mockResolvedValue(dummyVector),
      embedBatch: jest
        .fn()
        .mockImplementation(async (texts: string[]) =>
          texts.map(() => dummyVector),
        ),
    };

    ragService = new RagService(
      chunkingService,
      mockVectorStore as unknown as VectorStoreService,
      mockEmbeddingService as unknown as GeminiEmbeddingService,
    );
  });

  describe('ingestCorpus', () => {
    it('should ingest all 7 Marco Teórico files and the 17 symbols from 02-lel-normalizado.md', async () => {
      const response = await ragService.ingestCorpus(
        { projectName: 'Gestión de Documentos en Juzgado' },
        'override-key',
      );

      expect(response.status).toBe('ok');
      expect(response.projectName).toBe('Gestión de Documentos en Juzgado');
      expect(response.marcoTeoricoFilesProcessed).toBe(7);
      expect(response.marcoTeoricoChunksCount).toBeGreaterThanOrEqual(20);
      expect(response.lelSymbolsCount).toBe(17);
      expect(response.totalEmbeddingsStored).toBe(
        response.marcoTeoricoChunksCount + response.lelSymbolsCount,
      );
      expect(mockVectorStore.storeDocumentWithEmbeddings).toHaveBeenCalledTimes(
        8,
      );
    });
  });

  describe('ingestLel', () => {
    it('should chunk, embed, and store custom project LEL markdown', async () => {
      const lelMarkdown = `
### Símbolo Nº 1: Cajero
- **Tipo**: Sujeto
- **Noción**: Empleado que cobra trámites en ventanilla.
- **Impacto**: Registra pagos y entrega comprobantes.
`;

      const result = await ragService.ingestLel({
        projectName: 'Municipalidad',
        lelMarkdown,
      });

      expect(result.status).toBe('ok');
      expect(result.projectName).toBe('Municipalidad');
      expect(result.lelSymbolsCount).toBe(1);
      expect(result.embeddingsStored).toBe(1);
    });

    it('should throw BadRequestException if no LEL symbols can be parsed', async () => {
      await expect(
        ragService.ingestLel({
          projectName: 'Proyecto Vacío',
          lelMarkdown: 'Texto libre sin formato de símbolos LEL.',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('search', () => {
    it('should vectorize query and return similarity results', async () => {
      const result = await ragService.search({
        query: 'reglas de verbos débiles en episodios',
        type: DocType.MARCO_TEORICO,
        topK: 3,
      });

      expect(mockEmbeddingService.embedText).toHaveBeenCalledWith(
        'reglas de verbos débiles en episodios',
        undefined,
      );
      expect(mockVectorStore.similaritySearch).toHaveBeenCalledWith(
        dummyVector,
        {
          type: DocType.MARCO_TEORICO,
          projectName: undefined,
          topK: 3,
          minSimilarity: undefined,
        },
      );
      expect(result.count).toBe(1);
      expect(result.results[0].similarity).toBe(0.89);
    });
  });

  describe('getStats', () => {
    it('should return document and embedding counts grouped by DocType', async () => {
      const stats = await ragService.getStats();

      expect(stats.totalDocuments).toBe(8);
      expect(stats.totalEmbeddings).toBe(45);
      expect(stats.byType.MARCO_TEORICO.documents).toBe(7);
      expect(stats.byType.LEL.embeddings).toBe(17);
    });
  });
});

