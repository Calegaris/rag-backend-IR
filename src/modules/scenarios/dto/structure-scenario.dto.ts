import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ScenarioStructure } from '../parser/parser.types';
import { ValidationReport } from '../validator/validator.types';
import { ExtractedScenarioRole } from './extract-scenarios.dto';

export class StructureScenarioDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsNumber()
  @IsNotEmpty()
  scenarioNumber: number;

  @IsString()
  @IsNotEmpty()
  scenarioTitle: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Integrador', 'Particular', 'Sub-Escenario', 'Excepción'])
  scenarioRole: ExtractedScenarioRole;

  @IsString()
  @IsOptional()
  @IsIn(['ACTUAL', 'FUTURO'])
  scenarioTimeframe?: 'ACTUAL' | 'FUTURO';

  @IsString()
  @IsNotEmpty()
  rawContextText: string;

  @IsString()
  @IsOptional()
  lelMarkdown?: string;
}

export interface StructuredScenarioLLMOutput {
  title: string;
  objective: string;
  context: {
    geographicLocation?: string;
    temporalLocation?: string;
    preconditions?: string[];
  };
  resources: string[];
  actors: string[];
  episodes: Array<{
    number?: number;
    text: string;
    restriction?: string;
  }>;
  exceptions: Array<{
    cause: string;
    treatment: string;
  }>;
}

export interface StructureScenarioResponse {
  projectName: string;
  scenarioNumber: number;
  scenarioTitle: string;
  scenarioRole: ExtractedScenarioRole;
  formattedDescriptionMarkdown: string;
  parsedScenario: ScenarioStructure;
  validationReport: ValidationReport;
}
