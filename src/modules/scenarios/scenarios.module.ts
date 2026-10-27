import { Module } from '@nestjs/common';
import { MarkdownParserService } from './parser/markdown-parser.service';
import { DeterministicValidatorService } from './validator/deterministic-validator.service';
import { ScenariosService } from './scenarios.service';
import { ScenariosController } from './scenarios.controller';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [LLMModule],
  controllers: [ScenariosController],
  providers: [
    MarkdownParserService,
    DeterministicValidatorService,
    ScenariosService,
  ],
  exports: [
    MarkdownParserService,
    DeterministicValidatorService,
    ScenariosService,
  ],
})
export class ScenariosModule {}
