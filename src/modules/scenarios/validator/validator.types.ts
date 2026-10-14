import { ScenarioStructure } from '../parser/parser.types';

export type DefectType = 'O' | 'E' | 'D' | 'A';
export type AcademicSeverity = 'A' | 'M' | 'B';
export type IssueSeverity = 'ERROR' | 'WARNING';

export type ScenarioField =
  | 'Título'
  | 'Objetivo'
  | 'Contexto'
  | 'Actores'
  | 'Recursos'
  | 'Episodios'
  | 'Excepciones';

export interface DeterministicIssue {
  ruleId: string;
  itemControl: string;
  defectType: DefectType;
  academicSeverity: AcademicSeverity;
  severity: IssueSeverity;
  field: ScenarioField;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ValidationSummary {
  syntaxErrorsCount: number;
  structuralErrorsCount: number;
  warningsCount: number;
  semanticIssuesCount: number;
}

export interface ValidationReport {
  scenarioTitle: string;
  isValid: boolean;
  summary: ValidationSummary;
  parsedScenario: ScenarioStructure;
  validations: {
    deterministic: DeterministicIssue[];
    semantic: any[];
  };
}
