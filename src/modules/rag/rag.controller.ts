import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { IngestCorpusDto } from './dto/ingest-corpus.dto';
import { IngestLelDto } from './dto/ingest-lel.dto';
import { RagSearchDto } from './dto/rag-search.dto';
import {
  IngestCorpusResponse,
  IngestLelResponse,
  RagSearchResponse,
  RagService,
} from './rag.service';
import { RagStatsResponse } from './services/vector-store.service';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ingest/corpus')
  @HttpCode(HttpStatus.OK)
  async ingestCorpus(
    @Body() dto?: IngestCorpusDto,
    @Headers('x-llm-api-key') apiKey?: string,
  ): Promise<IngestCorpusResponse> {
    return this.ragService.ingestCorpus(dto, apiKey);
  }

  @Post('ingest/lel')
  @HttpCode(HttpStatus.OK)
  async ingestLel(
    @Body() dto: IngestLelDto,
    @Headers('x-llm-api-key') apiKey?: string,
  ): Promise<IngestLelResponse> {
    return this.ragService.ingestLel(dto, apiKey);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  async search(
    @Body() dto: RagSearchDto,
    @Headers('x-llm-api-key') apiKey?: string,
  ): Promise<RagSearchResponse> {
    return this.ragService.search(dto, apiKey);
  }

  @Get('stats')
  async getStats(): Promise<RagStatsResponse> {
    return this.ragService.getStats();
  }
}

