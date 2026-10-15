import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarkdownParserService } from './parser/markdown-parser.service';
import { DeterministicValidatorService } from './validator/deterministic-validator.service';
import { ParseScenarioDto } from './dto/parse-scenario.dto';
import { ValidateScenarioDto } from './dto/validate-scenario.dto';
import { ScenarioStructure } from './parser/parser.types';
import { ValidationReport } from './validator/validator.types';
import { LLMFactory } from '../llm/llm.factory';
import {
  ExtractScenariosDto,
  ExtractScenariosResponse,
} from './dto/extract-scenarios.dto';
import {
  StructureScenarioDto,
  StructuredScenarioLLMOutput,
  StructureScenarioResponse,
} from './dto/structure-scenario.dto';

interface RawExtractLLMOutput {
  scenarios: Array<{
    number: number;
    title: string;
    type: 'Integrador' | 'Particular' | 'Sub-Escenario' | 'Excepción';
    justification: string;
    sourceQuote: string;
  }>;
}

@Injectable()
export class ScenariosService {
  private readonly logger = new Logger(ScenariosService.name);

  constructor(
    private readonly parser: MarkdownParserService,
    private readonly deterministicValidator: DeterministicValidatorService,
    private readonly llmFactory: LLMFactory,
    private readonly configService: ConfigService,
  ) {}

  parse(dto: ParseScenarioDto): ScenarioStructure {
    return this.parser.parse(dto.rawMarkdown);
  }

  validate(dto: ValidateScenarioDto): ValidationReport {
    const parsedScenario = this.parser.parse(dto.rawMarkdown);
    return this.deterministicValidator.validate(parsedScenario);
  }

  async extract(
    dto: ExtractScenariosDto,
    options?: {
      apiKeyOverride?: string;
      providerOverride?: string;
      modelOverride?: string;
    },
  ): Promise<ExtractScenariosResponse> {
    const provider = this.llmFactory.getProvider(options?.providerOverride);
    const modelName =
      options?.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'gemini-2.5-flash';

    const systemPrompt = `Eres un Arquitecto de Software Senior y Experto en Ingeniería de Requisitos, especializado en la técnica de Escenarios y Léxico Extendido del Lenguaje (LEL) según el Marco Teórico oficial de Graciela Hadad y Luis Calegari.

Tu misión es analizar la documentación de entrada (transcripciones de entrevistas, objetivos o requerimientos) e IDENTIFICAR TODOS LOS ESCENARIOS CANDIDATOS que modelan situaciones del negocio.

REGLAS DE IDENTIFICACIÓN:
1. Una situación debe tener un fin establecido, actores, recursos, tiempo continuo y un ámbito determinado.
2. Título del Escenario:
   - Debe comenzar con un verbo en INFINITIVO en MAYÚSCULAS (ej: "CARGAR DOCUMENTACIÓN", "COBRAR EL TRÁMITE").
   - SIEMPRE desde la perspectiva del NEGOCIO y del SISTEMA que presta el servicio (ej: "Cobrar el trámite" en vez de "Pagar el trámite").
   - Utilizar vocabulario acorde a los símbolos del LEL si se proporciona un glosario.
3. Tipos de Escenario:
   - 'Particular': Escenario concreto que describe una situación completa y operacional.
   - 'Sub-Escenario': Situación con objetivo acotado referenciada desde episodios de otros escenarios (ej: "LISTAR DOCUMENTOS").
   - 'Integrador': Escenario de alto nivel que agrupa secuencias de escenarios para mostrar la visión global del proceso de negocio.
   - 'Excepción': Escenario que describe el tratamiento de una contingencia o fallo complejo.

DEBES RESPONDER EXCLUSIVAMENTE UN OBJETO JSON con este esquema exacto:
{
  "scenarios": [
    {
      "number": 1,
      "title": "NOMBRE DEL ESCENARIO EN MAYÚSCULAS",
      "type": "Particular",
      "justification": "Explicación breve de la situación y por qué es un escenario válido.",
      "sourceQuote": "Cita textual breve del texto origen que evidencia esta situación."
    }
  ]
}`;

    const userPrompt = `Proyecto: ${dto.projectName}

${dto.lelMarkdown ? `GLOSARIO LEL DE REFERENCIA:\n${dto.lelMarkdown}\n\n` : ''}TEXTO DE ORIGEN A ANALIZAR:
${dto.rawText}`;

    this.logger.log(
      `Extrayendo lista de escenarios para proyecto: ${dto.projectName} con proveedor ${provider.providerName}`,
    );

    const rawOutput = await provider.generateStructured<RawExtractLLMOutput>({
      systemPrompt,
      userPrompt,
      apiKeyOverride: options?.apiKeyOverride,
      modelOverride: modelName,
      temperature: 0.1,
    });

    const scenarios = rawOutput.scenarios || [];
    const dateStr = this.formatCurrentDate();

    // Armado de la plantilla oficial de Lista de Escenarios
    let formattedListMarkdown = `ESCENARIOS

Proyecto: ${dto.projectName}

Responsable/s: ${provider.providerName.toUpperCase()} (${modelName})

Fecha: ${dateStr}



LISTA DE ESCENARIOS



| Nro. | Título del Escenario | Tipo (*) |
| :--- | :--- | :--- |
`;

    scenarios.forEach((sc) => {
      formattedListMarkdown += `| ${sc.number} | ${sc.title} | ${sc.type} |\n`;
    });

    formattedListMarkdown += `\n(*) Tipo: <Integrador, Particular, Sub-Escenario o Excepción>\n`;

    return {
      projectName: dto.projectName,
      llmProvider: provider.providerName,
      llmModel: modelName,
      scenarios,
      formattedListMarkdown,
    };
  }

  async structure(
    dto: StructureScenarioDto,
    options?: {
      apiKeyOverride?: string;
      providerOverride?: string;
      modelOverride?: string;
    },
  ): Promise<StructureScenarioResponse> {
    const provider = this.llmFactory.getProvider(options?.providerOverride);
    const modelName =
      options?.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'gemini-2.5-flash';

    const systemPrompt = `Eres un Arquitecto de Software Senior y Experto en Ingeniería de Requisitos, especializado en la técnica de Escenarios y Léxico Extendido del Lenguaje (LEL) según el Marco Teórico oficial (Hadad / Calegari) y el Checklist v3 de Consistencia.

Tu misión es estructurar y redactar con máxima rigurosidad técnica el escenario solicitado a partir del contexto provisto.

REGLAS DE ORO DEL MARCO TEÓRICO (CHECKLIST V3):
1. TÍTULO Y OBJETIVO:
   - Título: En mayúsculas, verbo principal en INFINITIVO, perspectiva del negocio/sistema (ej: "CARGAR DOCUMENTACIÓN").
   - Objetivo: Una sola oración con UN ÚNICO verbo principal en infinitivo. Coherente con el título.
2. CONTEXTO:
   - Ubicación Geográfica: Un solo lugar físico o separados por 'o'.
   - Ubicación Temporal: Período u horario.
   - Precondiciones: Estados o condiciones previas obligatorias.
   - REGLA DE NO REDUNDANCIA: Los episodios NUNCA deben comprobar condiciones que ya estén en el Contexto o Precondición.
3. ACTORES Y RECURSOS:
   - Si el rol es 'Integrador': Actores y Recursos DEBEN ESTAR VACÍOS (listas vacías []).
   - Si el rol es 'Particular', 'Sub-Escenario' o 'Excepción':
     - Recursos: Entidades pasivas (Objetos LEL). Disponibilidad previa obligatoria (no se crean en los episodios). Correspondencia biyectiva 100%: todo recurso declarado debe usarse en los episodios y viceversa.
     - Actores: Entidades activas que realizan acciones (Sujetos LEL). Correspondencia biyectiva 100%: todo actor declarado debe ejecutar al menos un episodio y viceversa. En escenarios futuros, incluir 'Sistema' si ejecuta acciones.
4. EPISODIOS:
   - Mínimo dos (2) episodios.
   - Redactados en PRESENTE DEL INDICATIVO (ej: "El Escribiente ingresa...", "El Sistema valida...").
   - ESTRICTAMENTE PROHIBIDO usar verbos débiles o potenciales: "puede", "podría", "debe", "debería".
   - Un solo verbo de acción concreta por episodio.
   - Si es Integrador: cada episodio es el título en mayúsculas de otro escenario.
   - Restricciones: requisitos no funcionales asociados al final del episodio en formato: [Restricción: "..."]
5. EXCEPCIONES:
   - Cada excepción debe tener Causa (evento de falla) y Tratamiento (acción simple o título de escenario en mayúsculas).

DEBES RESPONDER EXCLUSIVAMENTE UN OBJETO JSON con este esquema exacto:
{
  "title": "${dto.scenarioTitle}",
  "objective": "Objetivo concreto en infinitivo de una sola oración.",
  "context": {
    "geographicLocation": "Ubicación o string vacío",
    "temporalLocation": "Momento o string vacío",
    "preconditions": ["Precondición 1", "Precondición 2"]
  },
  "resources": ["Recurso1"],
  "actors": ["Actor1", "Sistema"],
  "episodes": [
    {
      "number": 1,
      "text": "Oración del episodio en presente indicativo.",
      "restriction": "Restricción no funcional si aplica o dejar vacío"
    }
  ],
  "exceptions": [
    {
      "cause": "Causa del fallo",
      "treatment": "Tratamiento resolutivo o aviso"
    }
  ]
}`;

    const userPrompt = `Proyecto: ${dto.projectName}
Número de Escenario: ${dto.scenarioNumber}
Título Asignado: ${dto.scenarioTitle}
Rol/Tipo: ${dto.scenarioRole}
Marco Temporal: ${dto.scenarioTimeframe || 'FUTURO'}

${dto.lelMarkdown ? `GLOSARIO LEL:\n${dto.lelMarkdown}\n\n` : ''}CONTEXTO DOCUMENTAL Y FUENTE DE INFORMACIÓN:
${dto.rawContextText}`;

    this.logger.log(
      `Estructurando escenario Nº ${dto.scenarioNumber} '${dto.scenarioTitle}' para proyecto ${dto.projectName}`,
    );

    const data = await provider.generateStructured<StructuredScenarioLLMOutput>({
      systemPrompt,
      userPrompt,
      apiKeyOverride: options?.apiKeyOverride,
      modelOverride: modelName,
      temperature: 0.1,
    });

    const dateStr = this.formatCurrentDate();

    // Armado del documento oficial según Plantilla Escenario-Salida-LLM-descripcion.md
    let formattedDescriptionMarkdown = `ESCENARIOS

Proyecto: ${dto.projectName}

Responsable/s: ${provider.providerName.toUpperCase()} (${modelName})

Fecha: ${dateStr}





DESCRIPCIÓN DE ESCENARIOS



Escenario Nro.: ${dto.scenarioNumber}

Título: ${data.title || dto.scenarioTitle}

Tipo de escenario: ${dto.scenarioRole}

Objetivo: ${data.objective}

Contexto

Ubicación Geográfica: ${data.context?.geographicLocation || '--'}

Ubicación Temporal: ${data.context?.temporalLocation || '--'}

Precondiciones:
${
  data.context?.preconditions && data.context.preconditions.length > 0
    ? data.context.preconditions.map((p) => `● ${p}`).join('\n')
    : '--'
}

Recursos: ${data.resources && data.resources.length > 0 ? data.resources.join(', ') : '--'}

Actores: ${data.actors && data.actors.length > 0 ? data.actors.join(', ') : '--'}

Episodios:
`;

    if (data.episodes && data.episodes.length > 0) {
      data.episodes.forEach((ep, idx) => {
        const epNum = ep.number || idx + 1;
        const rawRes = ep.restriction ? ep.restriction.trim() : '';
        const restrictionPart =
          rawRes.length > 0
            ? ` [Restricción: "${rawRes.replace(/^\[?Restricci[oó]n:\s*["“]?/i, '').replace(/["”\]]+$/g, '')}"]`
            : '';
        formattedDescriptionMarkdown += `${epNum}. ${ep.text}${restrictionPart}\n`;
      });
    }

    formattedDescriptionMarkdown += `\nExcepciones:\n`;
    if (data.exceptions && data.exceptions.length > 0) {
      data.exceptions.forEach((ex) => {
        const cleanCause = ex.cause.trim().replace(/\.+$/, '');
        const cleanTreatment = ex.treatment.trim().replace(/\.+$/, '');
        formattedDescriptionMarkdown += `Causa: ${cleanCause}. Tratamiento: ${cleanTreatment}.\n`;
      });
    } else {
      formattedDescriptionMarkdown += `--\n`;
    }

    // Auto-validación determinística inmediata
    const parsedScenario = this.parser.parse(formattedDescriptionMarkdown);
    const validationReport =
      this.deterministicValidator.validate(parsedScenario);

    return {
      projectName: dto.projectName,
      scenarioNumber: dto.scenarioNumber,
      scenarioTitle: data.title || dto.scenarioTitle,
      scenarioRole: dto.scenarioRole,
      formattedDescriptionMarkdown,
      parsedScenario,
      validationReport,
    };
  }

  private formatCurrentDate(): string {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
