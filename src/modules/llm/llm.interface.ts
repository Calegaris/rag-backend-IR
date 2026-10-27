export interface GenerateStructuredOptions {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema?: object;
  apiKeyOverride?: string;
  modelOverride?: string;
  temperature?: number;
}

export interface ILLMProvider {
  readonly providerName: string;
  generateStructured<T>(options: GenerateStructuredOptions): Promise<T>;
}
