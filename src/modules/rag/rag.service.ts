import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiEmbeddingService } from '../llm/providers/gemini-embedding.service';
import { IngestCorpusDto } from './dto/ingest-corpus.dto';
import { IngestLelDto } from './dto/ingest-lel.dto';
import { DocType, RagSearchDto } from './dto/rag-search.dto';
import { ChunkingService } from './services/chunking.service';
import {
  RagStatsResponse,
  SimilaritySearchResult,
  VectorStoreService,
} from './services/vector-store.service';

export interface IngestCorpusResponse {
  status: 'ok';
  projectName: string;
  marcoTeoricoFilesProcessed: number;
  marcoTeoricoChunksCount: number;
  lelSymbolsCount: number;
  totalEmbeddingsStored: number;
}

export interface IngestLelResponse {
  status: 'ok';
  projectName: string;
  documentId: string;
  title: string;
  lelSymbolsCount: number;
  embeddingsStored: number;
}

export interface RagSearchResponse {
  query: string;
  count: number;
  results: SimilaritySearchResult[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly chunkingService: ChunkingService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly embeddingService: GeminiEmbeddingService,
  ) {}

  async ingestCorpus(
    dto?: IngestCorpusDto,
    apiKey?: string,
  ): Promise<IngestCorpusResponse> {
    const projectName =
      dto?.projectName?.trim() || 'Gestión de Documentos en Juzgado';

    const corpusBaseDir = this.resolveCorpusBaseDir();
    const marcoTeoricoDir = path.join(
      corpusBaseDir,
      'marco-teorico-particionado',
    );
    const lelFilePath = path.join(
      corpusBaseDir,
      'casos-estudio',
      'Caso Gestion Documentos Juzgado',
      'texto-anonimizado',
      '02-lel-normalizado.md',
    );

    if (!fs.existsSync(marcoTeoricoDir)) {
      throw new NotFoundException(
        `Marco Teórico directory not found at: ${marcoTeoricoDir}`,
      );
    }

    if (!fs.existsSync(lelFilePath)) {
      throw new NotFoundException(
        `Normalized LEL file not found at: ${lelFilePath}`,
      );
    }

    const files = fs
      .readdirSync(marcoTeoricoDir)
      .filter(
        (file) =>
          file.toLowerCase().endsWith('.md') &&
          file.toUpperCase() !== 'MANIFEST.MD',
      )
      .sort();

    let marcoTeoricoFilesProcessed = 0;
    let marcoTeoricoChunksCount = 0;

    for (const filename of files) {
      const fullPath = path.join(marcoTeoricoDir, filename);
      const rawMarkdown = fs.readFileSync(fullPath, 'utf-8');
      const chunks = this.chunkingService.chunkMarcoTeoricoFile(
        filename,
        rawMarkdown,
      );

      if (chunks.length === 0) {
        continue;
      }

      const vectors = await this.embeddingService.embedBatch(
        chunks.map((c) => c.content),
        apiKey,
      );

      const docTitle = chunks[0].metadata.title || filename;

      const stored = await this.vectorStoreService.storeDocumentWithEmbeddings({
        title: docTitle,
        type: DocType.MARCO_TEORICO,
        content: rawMarkdown,
        filePath: fullPath,
        chunks: chunks.map((chunk, idx) => ({
          content: chunk.content,
          vector: vectors[idx],
          metadata: chunk.metadata,
        })),
      });

      marcoTeoricoFilesProcessed++;
      marcoTeoricoChunksCount += stored.chunksStored;
      this.logger.log(
        `Ingested Marco Teórico file '${filename}' (${stored.chunksStored} chunks)`,
      );
    }

    const rawLelMarkdown = fs.readFileSync(lelFilePath, 'utf-8');
    const lelResult = await this.ingestLel(
      {
        projectName,
        title: `LEL - ${projectName}`,
        lelMarkdown: rawLelMarkdown,
      },
      apiKey,
      lelFilePath,
    );

    const lelSymbolsCount = lelResult.lelSymbolsCount;
    const totalEmbeddingsStored = marcoTeoricoChunksCount + lelSymbolsCount;

    return {
      status: 'ok',
      projectName,
      marcoTeoricoFilesProcessed,
      marcoTeoricoChunksCount,
      lelSymbolsCount,
      totalEmbeddingsStored,
    };
  }

  async ingestLel(
    dto: IngestLelDto,
    apiKey?: string,
    filePath?: string,
  ): Promise<IngestLelResponse> {
    const chunks = this.chunkingService.chunkLelMarkdown(
      dto.projectName,
      dto.lelMarkdown,
    );

    if (chunks.length === 0) {
      throw new BadRequestException(
        'No LEL symbols could be extracted from the provided markdown.',
      );
    }

    const vectors = await this.embeddingService.embedBatch(
      chunks.map((c) => c.content),
      apiKey,
    );

    const title = dto.title?.trim() || `LEL - ${dto.projectName}`;

    const stored = await this.vectorStoreService.storeDocumentWithEmbeddings({
      title,
      type: DocType.LEL,
      content: dto.lelMarkdown,
      filePath,
      chunks: chunks.map((chunk, idx) => ({
        content: chunk.content,
        vector: vectors[idx],
        metadata: chunk.metadata,
      })),
    });

    this.logger.log(
      `Ingested LEL '${title}' for project '${dto.projectName}' (${stored.chunksStored} symbols)`,
    );

    return {
      status: 'ok',
      projectName: dto.projectName,
      documentId: stored.documentId,
      title,
      lelSymbolsCount: chunks.length,
      embeddingsStored: stored.chunksStored,
    };
  }

  async search(
    dto: RagSearchDto,
    apiKey?: string,
  ): Promise<RagSearchResponse> {
    const queryVector = await this.embeddingService.embedText(
      dto.query,
      apiKey,
    );

    const results = await this.vectorStoreService.similaritySearch(
      queryVector,
      {
        type: dto.type,
        projectName: dto.projectName,
        topK: dto.topK ?? 5,
        minSimilarity: dto.minSimilarity,
      },
    );

    return {
      query: dto.query,
      count: results.length,
      results,
    };
  }

  async getStats(): Promise<RagStatsResponse> {
    return this.vectorStoreService.getStats();
  }

  private resolveCorpusBaseDir(): string {
    const candidates = [
      path.resolve(process.cwd(), '..', 'luis-angel-calegari'),
      path.resolve(process.cwd(), 'luis-angel-calegari'),
      path.resolve(__dirname, '../../../../luis-angel-calegari'),
      path.resolve(__dirname, '../../../../../luis-angel-calegari'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }
}

