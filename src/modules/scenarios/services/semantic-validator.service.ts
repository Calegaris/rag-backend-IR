import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLMFactory } from '../../llm/llm.factory';
import { DocType } from '../../rag/dto/rag-search.dto';
import { RagService } from '../../rag/rag.service';
import { ScenarioStructure } from '../parser/parser.types';
import {
  DeterministicIssue,
  RagContextUsed,
  SemanticIssueComponent,
  SemanticIssueSeverity,
  SemanticValidationIssue,
} from '../validator/validator.types';

interface RawSemanticLLMResponse {
  issues?: Array<{
    code?: string;
    severity?: string;
    component?: string;
    message?: string;
    suggestion?: string;
    ragReference?: string;
    episodeNumber?: number;
  }>;
}

export interface ValidateSemanticsOptions {
  projectName?: string;
  apiKeyOverride?: string;
  providerOverride?: string;
  modelOverride?: string;
}

export interface ValidateSemanticsResult {
  issues: SemanticValidationIssue[];
  ragContextUsed: RagContextUsed;
  llmProvider: string;
  llmModel: string;
}

const VALID_SEVERITIES: SemanticIssueSeverity[] = ['ERROR', 'WARNING', 'INFO'];
const VALID_COMPONENTS: SemanticIssueComponent[] = [
  'TITULO',
  'OBJETIVO',
  'CONTEXTO',
  'ACTORES',
  'RECURSOS',
  'EPISODIOS',
  'EXCEPCIONES',
  'LEL',
];

@Injectable()
export class SemanticValidatorService {
  private readonly logger = new Logger(SemanticValidatorService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly llmFactory: LLMFactory,
    private readonly configService: ConfigService,
  ) {}

  async validateSemantics(
    parsedScenario: ScenarioStructure,
    deterministicIssues: DeterministicIssue[] = [],
    options?: ValidateSemanticsOptions,
  ): Promise<ValidateSemanticsResult> {
    const projectName =
      options?.projectName?.trim() || 'Gestión de Documentos en Juzgado';
    const query = this.buildSemanticQuery(parsedScenario);

    const [lelSearchResponse, marcoSearchResponse] = await Promise.all([
      this.ragService.search(
        {
          query,
          type: DocType.LEL,
          projectName,
          topK: 10,
        },
        options?.apiKeyOverride,
      ),
      this.ragService.search(
        {
          query,
          type: DocType.MARCO_TEORICO,
          topK: 6,
        },
        options?.apiKeyOverride,
      ),
    ]);

    const lelResults = lelSearchResponse?.results ?? [];
    const marcoResults = marcoSearchResponse?.results ?? [];

    const lelSymbols = this.extractLelSymbols(lelResults);
    const ragContextUsed: RagContextUsed = {
      marcoTeoricoChunks: marcoResults.length,
      lelSymbols,
    };

    const provider = this.llmFactory.getProvider(options?.providerOverride);
    const llmModel =
      options?.modelOverride ||
      this.configService.get<string>('llm.model') ||
      'gemini-3.6-flash';

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(
      parsedScenario,
      deterministicIssues,
      lelResults.map((r) => r.content),
      marcoResults.map((r) => r.content),
    );

    this.logger.log(
      `Executing hybrid RAG semantic validation for scenario '${parsedScenario.title || 'Sin título'}' using ${provider.providerName} (${llmModel})`,
    );

    const rawOutput = await provider.generateStructured<RawSemanticLLMResponse>({
      systemPrompt,
      userPrompt,
      apiKeyOverride: options?.apiKeyOverride,
      modelOverride: llmModel,
      temperature: 0.1,
    });

    const issues = this.normalizeSemanticIssues(rawOutput?.issues);

    return {
      issues,
      ragContextUsed,
      llmProvider: provider.providerName,
      llmModel,
    };
  }

  private buildSemanticQuery(parsedScenario: ScenarioStructure): string {
    const legacyContext = (
      parsedScenario as ScenarioStructure & {
        context?: { preconditions?: string[] | string };
      }
    ).context;

    const preconditionsText =
      parsedScenario.contextPrecond ||
      (Array.isArray(legacyContext?.preconditions)
        ? legacyContext.preconditions.join(' ')
        : legacyContext?.preconditions) ||
      '';

    const episodesText = (parsedScenario.episodes || [])
      .map((ep) => ep.rawText || ep.text || '')
      .filter(Boolean)
      .join(' ');

    const exceptionsText = (parsedScenario.exceptions || [])
      .map((ex) => {
        const solutionOrTreatment =
          (ex as unknown as { solucion?: string }).solucion ||
          ex.tratamiento ||
          '';
        return `${ex.causa || ''} ${solutionOrTreatment}`.trim();
      })
      .filter(Boolean)
      .join(' ');

    const parts = [
      parsedScenario.title || '',
      parsedScenario.objective || '',
      (parsedScenario.actors || []).join(' '),
      (parsedScenario.resources || []).join(' '),
      preconditionsText,
      episodesText,
      exceptionsText,
    ]
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    return parts.join(' | ') || 'Escenario sin contenido';
  }

  private extractLelSymbols(
    lelResults: Array<{
      content: string;
      metadata: Record<string, any> | null;
    }>,
  ): string[] {
    const symbolSet = new Set<string>();

    for (const item of lelResults) {
      const metaSymbol = item.metadata?.symbolName;
      if (typeof metaSymbol === 'string' && metaSymbol.trim().length > 0) {
        symbolSet.add(metaSymbol.trim());
        continue;
      }

      const contentMatch = item.content?.match(
        /S[ií]mbolo\s+LEL\s*:\s*([^\n\r]+)/i,
      );
      if (contentMatch && contentMatch[1].trim().length > 0) {
        symbolSet.add(contentMatch[1].trim());
      }
    }

    return Array.from(symbolSet);
  }

  private buildSystemPrompt(): string {
    return `Eres un Auditor Académico Experto en Ingeniería de Requisitos, especializado en el Método de Escenarios y Léxico Extendido del Lenguaje (LEL) según el Marco Teórico de Graciela Hadad y Luis Calegari.

Tu misión es realizar una VALIDACIÓN SEMÁNTICA PROFUNDA de un escenario utilizando exclusivamente como evidencia:
1. Los Símbolos del LEL recuperados por búsqueda vectorial (RAG).
2. Los fragmentos del Marco Teórico recuperados por búsqueda vectorial (RAG).

IMPORTANTE:
- NO repitas ni dupliques los errores sintácticos o determinísticos ya detectados por el parser de expresiones regulares (que se te informan en el prompt).
- REGLA CRÍTICA SOBRE EL ACTOR 'Sistema': En los Escenarios Futuros (type: 'FUTURO'), el 'Sistema' (o 'Sistema EJE') ES un Actor válido y obligatorio en la lista de Actores según el Marco Teórico de Hadad, aunque no figure como Sujeto en el LEL del dominio. NUNCA reportes un error o warning de SEM_LEL_CONSISTENCY porque 'Sistema' figure en Actores en un escenario FUTURO.
- Evalúa ÚNICAMENTE aspectos semánticos, conceptuales y de consistencia de dominio en las siguientes 6 dimensiones:

1. Consistencia con el LEL ("SEM_LEL_CONSISTENCY"):
   - ¿Los Actores declarados corresponden a símbolos de categoría "Sujeto" en el LEL (recordando que en escenarios FUTURO el 'Sistema' o 'Sistema EJE' es un Actor válido y obligatorio aunque no esté en el LEL)?
   - ¿Los Recursos declarados corresponden a símbolos de categoría "Objeto" en el LEL?
   - ¿Se utilizan sinónimos informales o términos ajenos al dominio cuando existe un Símbolo LEL específico recuperado?
   - ¿Las acciones de los episodios contradicen la Noción o el Impacto de los símbolos del LEL?

2. Formulación del Objetivo ("SEM_OBJECTIVE_FORMULATION"):
   - ¿El Objetivo expresa el estado final o propósito global del escenario desde la perspectiva del negocio/sistema, o está mal formulado como una acción puntual de un actor individual?

3. No Redundancia Contexto vs. Episodios ("SEM_PRECONDITION_REDUNDANCY"):
   - ¿Algún episodio vuelve a verificar mediante un condicional o validación una condición que ya está garantizada como verdadera en las Precondiciones del Contexto?

4. Enfoque "Qué" vs. "Cómo" ("SEM_WHAT_VS_HOW"):
   - ¿Algún episodio describe detalles técnicos de interfaz o implementación (botones, colores, pantallas específicas, clics, tablas SQL, protocolos técnicos) en lugar de describir la interacción funcional a nivel del dominio?

5. Adecuación de Excepciones y Restricciones ("SEM_EXCEPTION_TREATMENT"):
   - ¿Las causas de las excepciones representan verdaderos obstáculos para alcanzar el objetivo y sus tratamientos son resolutivos o coherentes?
   - ¿Las restricciones asociadas a los episodios expresan requisitos no funcionales o de calidad pertinentes al episodio?

6. Coherencia General ("SEM_COHERENCE"):
   - ¿Existe un flujo lógico completo entre los episodios que permita alcanzar el Objetivo declarado del escenario?
   - ¿Las invocaciones a sub-escenarios son coherentes con el flujo?

Cada hallazgo DEBE incluir en "ragReference" la cita al Símbolo LEL (ej. "Símbolo LEL: Documento (Objeto)") o la sección del Marco Teórico utilizada como evidencia.
Si el escenario no presenta defectos semánticos, devuelve "issues": [].

DEBES RESPONDER EXCLUSIVAMENTE UN OBJETO JSON con este esquema exacto:
{
  "issues": [
    {
      "code": "SEM_LEL_CONSISTENCY | SEM_OBJECTIVE_FORMULATION | SEM_PRECONDITION_REDUNDANCY | SEM_WHAT_VS_HOW | SEM_EXCEPTION_TREATMENT | SEM_COHERENCE",
      "severity": "ERROR | WARNING | INFO",
      "component": "TITULO | OBJETIVO | CONTEXTO | ACTORES | RECURSOS | EPISODIOS | EXCEPCIONES | LEL",
      "message": "Descripción clara y precisa del problema semántico detectado.",
      "suggestion": "Sugerencia concreta de corrección alineada al LEL y Marco Teórico.",
      "ragReference": "Referencia al Símbolo LEL o Sección del Marco Teórico aplicada.",
      "episodeNumber": 1
    }
  ]
}`;
  }

  private buildUserPrompt(
    parsedScenario: ScenarioStructure,
    deterministicIssues: DeterministicIssue[],
    lelChunks: string[],
    marcoChunks: string[],
  ): string {
    const lelSection =
      lelChunks.length > 0
        ? lelChunks.map((chunk, idx) => `[LEL #${idx + 1}]\n${chunk}`).join('\n\n')
        : 'No se recuperaron símbolos LEL para este proyecto.';

    const marcoSection =
      marcoChunks.length > 0
        ? marcoChunks
            .map((chunk, idx) => `[Marco Teórico #${idx + 1}]\n${chunk}`)
            .join('\n\n')
        : 'No se recuperaron fragmentos del Marco Teórico.';

    const deterministicSummary =
      deterministicIssues.length > 0
        ? deterministicIssues
            .map(
              (issue) =>
                `- [${issue.ruleId}] (${issue.field}): ${issue.message}`,
            )
            .join('\n')
        : 'Ninguno.';

    const episodesFormatted =
      parsedScenario.episodes && parsedScenario.episodes.length > 0
        ? parsedScenario.episodes
            .map(
              (ep) =>
                `${ep.number}. ${ep.rawText || ep.text}${
                  ep.restriction ? ` [Restricción: "${ep.restriction}"]` : ''
                }`,
            )
            .join('\n')
        : 'Sin episodios.';

    const exceptionsFormatted =
      parsedScenario.exceptions && parsedScenario.exceptions.length > 0
        ? parsedScenario.exceptions
            .map(
              (ex, idx) =>
                `${idx + 1}. Causa: ${ex.causa} | Tratamiento: ${ex.tratamiento}`,
            )
            .join('\n')
        : 'Sin excepciones.';

    return `=== CONTEXTO RAG: SÍMBOLOS LEL DEL DOMINIO ===
${lelSection}

=== CONTEXTO RAG: REGLAS DEL MARCO TEÓRICO ===
${marcoSection}

=== ERRORES DETERMINÍSTICOS YA DETECTADOS (NO DUPLICAR) ===
${deterministicSummary}

=== ESCENARIO A EVALUAR SEMÁNTICAMENTE ===
Título: ${parsedScenario.title}
Tipo (type): ${parsedScenario.type}
Rol: ${parsedScenario.rawRole || parsedScenario.type}
Objetivo: ${parsedScenario.objective}
Contexto Geográfico: ${parsedScenario.contextGeo || '--'}
Contexto Temporal: ${parsedScenario.contextTime || '--'}
Precondiciones: ${parsedScenario.contextPrecond || '--'}
Actores: ${(parsedScenario.actors || []).join(', ') || '--'}
Recursos: ${(parsedScenario.resources || []).join(', ') || '--'}

Episodios:
${episodesFormatted}

Excepciones:
${exceptionsFormatted}`;
  }

  private normalizeSemanticIssues(
    rawIssues: RawSemanticLLMResponse['issues'],
  ): SemanticValidationIssue[] {
    if (!Array.isArray(rawIssues)) {
      return [];
    }

    return rawIssues
      .filter((item) => item && typeof item === 'object' && item.message)
      .map((item) => {
        const rawSeverity = String(item.severity || 'WARNING')
          .toUpperCase()
          .trim() as SemanticIssueSeverity;
        const severity: SemanticIssueSeverity = VALID_SEVERITIES.includes(
          rawSeverity,
        )
          ? rawSeverity
          : 'WARNING';

        const rawComponent = String(item.component || 'EPISODIOS')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim() as SemanticIssueComponent;
        const component: SemanticIssueComponent = VALID_COMPONENTS.includes(
          rawComponent,
        )
          ? rawComponent
          : 'EPISODIOS';

        const normalized: SemanticValidationIssue = {
          code: item.code?.trim() || 'SEM_COHERENCE',
          severity,
          component,
          message: String(item.message).trim(),
          suggestion: String(
            item.suggestion || 'Revisar consistencia con el Marco Teórico y LEL.',
          ).trim(),
        };

        if (item.ragReference && String(item.ragReference).trim().length > 0) {
          normalized.ragReference = String(item.ragReference).trim();
        }

        if (
          typeof item.episodeNumber === 'number' &&
          !Number.isNaN(item.episodeNumber)
        ) {
          normalized.episodeNumber = item.episodeNumber;
        }

        return normalized;
      });
  }
}
