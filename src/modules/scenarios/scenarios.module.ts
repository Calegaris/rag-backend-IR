import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { MarkdownParserService } from './parser/markdown-parser.service';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';
import { SemanticValidatorService } from './services/semantic-validator.service';
import { DeterministicValidatorService } from './validator/deterministic-validator.service';

@Module({
  imports: [LLMModule, RagModule, PrismaModule],
  controllers: [ScenariosController],
  providers: [
    MarkdownParserService,
    DeterministicValidatorService,
    SemanticValidatorService,
    ScenariosService,
  ],
  exports: [
    MarkdownParserService,
    DeterministicValidatorService,
    SemanticValidatorService,
    ScenariosService,
  ],
})
export class ScenariosModule {}
