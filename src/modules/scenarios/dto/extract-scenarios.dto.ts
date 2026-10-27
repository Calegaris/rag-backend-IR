import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExtractScenariosDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsString()
  @IsNotEmpty()
  rawText: string;

  @IsString()
  @IsOptional()
  lelMarkdown?: string;
}

export type ExtractedScenarioRole = 'Integrador' | 'Particular' | 'Sub-Escenario' | 'Excepción';

export interface ExtractedScenarioItem {
  number: number;
  title: string;
  type: ExtractedScenarioRole;
  justification: string;
  sourceQuote: string;
}

export interface ExtractScenariosResponse {
  projectName: string;
  llmProvider: string;
  llmModel: string;
  scenarios: ExtractedScenarioItem[];
  formattedListMarkdown: string;
}
