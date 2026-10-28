import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../llm/llm.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { ChunkingService } from './services/chunking.service';
import { VectorStoreService } from './services/vector-store.service';

@Module({
  imports: [PrismaModule, LLMModule],
  controllers: [RagController],
  providers: [RagService, ChunkingService, VectorStoreService],
  exports: [RagService, ChunkingService, VectorStoreService],
})
export class RagModule {}

