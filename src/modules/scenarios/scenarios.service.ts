import { Injectable } from '@nestjs/common';
import { MarkdownParserService } from './parser/markdown-parser.service';
import { DeterministicValidatorService } from './validator/deterministic-validator.service';
import { ParseScenarioDto } from './dto/parse-scenario.dto';
import { ValidateScenarioDto } from './dto/validate-scenario.dto';
import { ScenarioStructure } from './parser/parser.types';
import { ValidationReport } from './validator/validator.types';

@Injectable()
export class ScenariosService {
  constructor(
    private readonly parser: MarkdownParserService,
    private readonly deterministicValidator: DeterministicValidatorService,
  ) {}

  parse(dto: ParseScenarioDto): ScenarioStructure {
    return this.parser.parse(dto.rawMarkdown);
  }

  validate(dto: ValidateScenarioDto): ValidationReport {
    const parsedScenario = this.parser.parse(dto.rawMarkdown);
    return this.deterministicValidator.validate(parsedScenario);
  }
}
