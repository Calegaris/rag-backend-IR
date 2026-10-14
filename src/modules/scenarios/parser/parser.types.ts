export type PrismaScenarioType = 'ACTUAL' | 'FUTURO' | 'INTEGRADOR';

export type TemplateScenarioRole =
  | 'PARTICULAR'
  | 'SUB_ESCENARIO'
  | 'INTEGRADOR'
  | 'EXCEPCION'
  | string;

export type EpisodeType =
  | 'SIMPLE'
  | 'CONDITIONAL'
  | 'OPTIONAL'
  | 'NON_SEQUENTIAL'
  | 'SUB_SCENARIO';

export interface EpisodeParsed {
  number: number;
  text: string;
  restriction?: string;
  type: EpisodeType;
  rawText: string;
}

export interface ScenarioException {
  causa: string;
  tratamiento: string;
  rawText?: string;
}

export interface ScenarioStructure {
  title: string;
  type: PrismaScenarioType;
  rawRole: TemplateScenarioRole;
  scenarioNumber?: number;
  objective: string;
  contextGeo: string | null;
  contextTime: string | null;
  contextPrecond: string | null;
  actors: string[];
  resources: string[];
  episodes: EpisodeParsed[];
  exceptions: ScenarioException[];
  rawMarkdown: string;
}
