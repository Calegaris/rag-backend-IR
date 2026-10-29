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

export type SemanticIssueCode =
  | 'SEM_LEL_CONSISTENCY'
  | 'SEM_OBJECTIVE_FORMULATION'
  | 'SEM_PRECONDITION_REDUNDANCY'
  | 'SEM_WHAT_VS_HOW'
  | 'SEM_EXCEPTION_TREATMENT'
  | 'SEM_COHERENCE'
  | string;

export type SemanticIssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type SemanticIssueComponent =
  | 'TITULO'
  | 'OBJETIVO'
  | 'CONTEXTO'
  | 'ACTORES'
  | 'RECURSOS'
  | 'EPISODIOS'
  | 'EXCEPCIONES'
  | 'LEL';

export interface SemanticValidationIssue {
  code: SemanticIssueCode;
  severity: SemanticIssueSeverity;
  component: SemanticIssueComponent;
  message: string;
  suggestion: string;
  ragReference?: string;
  episodeNumber?: number;
}

export interface RagContextUsed {
  marcoTeoricoChunks: number;
  lelSymbols: string[];
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
    semantic: SemanticValidationIssue[];
  };
  ragContextUsed?: RagContextUsed;
}
