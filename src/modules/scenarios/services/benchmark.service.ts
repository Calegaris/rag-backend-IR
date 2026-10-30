import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RunBenchmarkDto } from '../dto/run-benchmark.dto';
import { MarkdownParserService } from '../parser/markdown-parser.service';
import { DeterministicValidatorService } from '../validator/deterministic-validator.service';
import {
  DeterministicIssue,
  RagContextUsed,
  SemanticValidationIssue,
  ValidationSummary,
} from '../validator/validator.types';
import { SemanticValidatorService } from './semantic-validator.service';

export interface BenchmarkScenarioReport {
  scenarioNumber: number;
  title: string;
  type: string;
  isValid: boolean;
  summary: ValidationSummary;
  validations: {
    deterministic: DeterministicIssue[];
    semantic: SemanticValidationIssue[];
  };
  ragContextUsed?: RagContextUsed;
  executionTimeMs: number;
}

export interface BenchmarkSuiteReport {
  projectName: string;
  totalScenarios: number;
  validScenariosCount: number;
  invalidScenariosCount: number;
  totalSyntaxErrors: number;
  totalStructuralErrors: number;
  totalWarnings: number;
  totalSemanticIssues: number;
  executionTimeMs: number;
  scenarios: BenchmarkScenarioReport[];
}

export interface RunBenchmarkOptions {
  apiKeyOverride?: string;
  providerOverride?: string;
  modelOverride?: string;
}

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name);

  constructor(
    private readonly parser: MarkdownParserService,
    private readonly deterministicValidator: DeterministicValidatorService,
    private readonly semanticValidator: SemanticValidatorService,
  ) {}

  async runBenchmark(
    dto?: RunBenchmarkDto,
    optionsOrApiKey?: RunBenchmarkOptions | string,
  ): Promise<BenchmarkSuiteReport> {
    const startSuiteTime = Date.now();
    const options: RunBenchmarkOptions =
      typeof optionsOrApiKey === 'string'
        ? { apiKeyOverride: optionsOrApiKey }
        : optionsOrApiKey || {};

    const projectName =
      dto?.projectName?.trim() || 'Gestión de Documentos en Juzgado';
    const shouldRunSemantic = dto?.enableSemantic !== false;

    const rawMarkdown =
      dto?.rawMarkdown && dto.rawMarkdown.trim().length > 0
        ? dto.rawMarkdown
        : this.loadDefaultBenchmarkFile();

    const scenarioBlocks = this.splitIntoScenarioBlocks(rawMarkdown);
    const scenarioReports: BenchmarkScenarioReport[] = [];

    for (let index = 0; index < scenarioBlocks.length; index++) {
      const block = scenarioBlocks[index];
      const startScenarioTime = Date.now();

      const parsedScenario = this.parser.parse(block);
      const report = this.deterministicValidator.validate(parsedScenario);

      if (shouldRunSemantic) {
        const semanticResult = await this.semanticValidator.validateSemantics(
          parsedScenario,
          report.validations.deterministic,
          {
            projectName,
            ...options,
          },
        );

        report.validations.semantic = semanticResult.issues;
        report.ragContextUsed = semanticResult.ragContextUsed;
        report.summary.semanticIssuesCount = semanticResult.issues.length;

        const semanticErrorsCount = semanticResult.issues.filter(
          (issue) => issue.severity === 'ERROR',
        ).length;

        report.isValid =
          report.summary.syntaxErrorsCount === 0 &&
          report.summary.structuralErrorsCount === 0 &&
          semanticErrorsCount === 0;
      }

      const executionTimeMs = Math.max(0, Date.now() - startScenarioTime);

      scenarioReports.push({
        scenarioNumber: parsedScenario.scenarioNumber ?? index + 1,
        title: report.scenarioTitle || parsedScenario.title,
        type: parsedScenario.rawRole || parsedScenario.type,
        isValid: report.isValid,
        summary: report.summary,
        validations: report.validations,
        ragContextUsed: report.ragContextUsed,
        executionTimeMs,
      });
    }

    const validScenariosCount = scenarioReports.filter(
      (s) => s.isValid,
    ).length;
    const invalidScenariosCount = scenarioReports.length - validScenariosCount;
    const totalSyntaxErrors = scenarioReports.reduce(
      (sum, s) => sum + s.summary.syntaxErrorsCount,
      0,
    );
    const totalStructuralErrors = scenarioReports.reduce(
      (sum, s) => sum + s.summary.structuralErrorsCount,
      0,
    );
    const totalWarnings = scenarioReports.reduce(
      (sum, s) => sum + s.summary.warningsCount,
      0,
    );
    const totalSemanticIssues = scenarioReports.reduce(
      (sum, s) => sum + s.summary.semanticIssuesCount,
      0,
    );

    const totalExecutionTimeMs = Math.max(0, Date.now() - startSuiteTime);

    this.logger.log(
      `Benchmark completed for '${projectName}': ${scenarioReports.length} scenarios (${validScenariosCount} valid, ${invalidScenariosCount} invalid) in ${totalExecutionTimeMs}ms`,
    );

    return {
      projectName,
      totalScenarios: scenarioReports.length,
      validScenariosCount,
      invalidScenariosCount,
      totalSyntaxErrors,
      totalStructuralErrors,
      totalWarnings,
      totalSemanticIssues,
      executionTimeMs: totalExecutionTimeMs,
      scenarios: scenarioReports,
    };
  }

  splitIntoScenarioBlocks(rawMarkdown: string): string[] {
    const normalized = rawMarkdown.replace(/\r\n/g, '\n');

    // Split on scenario header lines such as "### Escenario Nº: 1", "Escenario Nro.: 1", "### Escenario 1"
    const rawParts = normalized.split(
      /^(?=\s*(?:#{1,4}\s*)?Escenario\s+(?:N[rroº°\.]*|#)?\s*:?\s*\d+)/im,
    );

    const blocks = rawParts
      .map((part) =>
        part.replace(/(?:^|\n)\s*---+\s*(?=\n|$)/g, '\n').trim(),
      )
      .filter((part) => {
        if (!part) return false;
        const startsWithScenarioHeader =
          /^\s*(?:#{1,4}\s*)?Escenario\s+(?:N[rroº°\.]*|#)?\s*:?\s*\d+/i.test(
            part,
          );
        const hasScenarioFields =
          /(?:^|\n)\s*(?:[●*•\-]\s*)?(?:\*\*)?(?:T[ií]tulo|Objetivo|Episodios)(?:\*\*)?\s*:/im.test(
            part,
          );
        return startsWithScenarioHeader && hasScenarioFields;
      });

    if (blocks.length > 0) {
      return blocks;
    }

    // Fallback: single scenario block if no "Escenario Nº" header is present
    const cleaned = normalized
      .replace(/(?:^|\n)\s*---+\s*(?=\n|$)/g, '\n')
      .trim();
    return cleaned ? [cleaned] : [];
  }

  private loadDefaultBenchmarkFile(): string {
    const corpusBaseDir = this.resolveCorpusBaseDir();
    const defaultFilePath = path.join(
      corpusBaseDir,
      'casos-estudio',
      'Caso Gestion Documentos Juzgado',
      'texto-anonimizado',
      '03-escenarios-futuros.md',
    );

    if (!fs.existsSync(defaultFilePath)) {
      throw new NotFoundException(
        `Default benchmark file not found at: ${defaultFilePath}`,
      );
    }

    return fs.readFileSync(defaultFilePath, 'utf-8');
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
