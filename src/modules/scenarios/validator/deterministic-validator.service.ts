import { Injectable } from '@nestjs/common';
import { ScenarioStructure } from '../parser/parser.types';
import {
  DeterministicIssue,
  ValidationReport,
  ValidationSummary,
} from './validator.types';

@Injectable()
export class DeterministicValidatorService {
  validate(scenario: ScenarioStructure): ValidationReport {
    const issues: DeterministicIssue[] = [];

    // 1. CHK-02-NULOS: Componentes Nulos
    this.checkNullComponents(scenario, issues);

    // 2. CHK-INT-VACIOS y CHK-INT-SUBESCENARIOS: Reglas de Escenario Integrador
    this.checkIntegratorRules(scenario, issues);

    // 3. CHK-03-MIN-EPISODIOS: Cantidad Mínima de Episodios (>= 2)
    this.checkMinEpisodes(scenario, issues);

    // 4. CHK-04-TITULO-INFINITIVO: Verbo en Infinitivo en Título
    this.checkTitleInfinitive(scenario, issues);

    // 5. CHK-16-VERBOS-DEBILES: Prohibición de Verbos Débiles en Episodios
    this.checkWeakVerbs(scenario, issues);

    // 6. CHK-17, CHK-18, CHK-19: Sintaxis BNF en Episodios
    this.checkBnfSyntax(scenario, issues);

    // 7. CHK-25-EXCEPCION-ESTRUCTURA: Estructura Causa-Tratamiento en Excepciones
    this.checkExceptionStructure(scenario, issues);

    // 8. CHK-ACTORES-MENCION: Mención de Actores en Episodios
    this.checkActorsMention(scenario, issues);

    const errorIssues = issues.filter((i) => i.severity === 'ERROR');
    const isValid = errorIssues.length === 0;

    const summary: ValidationSummary = {
      syntaxErrorsCount: issues.filter(
        (i) => (i.defectType === 'E' || i.defectType === 'A') && i.severity === 'ERROR',
      ).length,
      structuralErrorsCount: issues.filter(
        (i) => (i.defectType === 'O' || i.defectType === 'D') && i.severity === 'ERROR',
      ).length,
      warningsCount: issues.filter((i) => i.severity === 'WARNING').length,
      semanticIssuesCount: 0,
    };

    return {
      scenarioTitle: scenario.title,
      isValid,
      summary,
      parsedScenario: scenario,
      validations: {
        deterministic: issues,
        semantic: [],
      },
    };
  }

  // 1. Componentes Nulos
  private checkNullComponents(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    if (!scenario.title || scenario.title.trim() === '') {
      issues.push({
        ruleId: 'CHK-02-NULOS',
        itemControl: 'Controlar que los escenarios no posean componentes nulos',
        defectType: 'O',
        academicSeverity: 'M',
        severity: 'ERROR',
        field: 'Título',
        message: 'El componente Título no puede ser nulo o vacío.',
      });
    }

    if (!scenario.objective || scenario.objective.trim() === '') {
      issues.push({
        ruleId: 'CHK-02-NULOS',
        itemControl: 'Controlar que los escenarios no posean componentes nulos',
        defectType: 'O',
        academicSeverity: 'M',
        severity: 'ERROR',
        field: 'Objetivo',
        message: 'El componente Objetivo no puede ser nulo o vacío.',
      });
    }

    // Contexto: Al menos uno de los tres componentes debe estar presente
    const hasGeo = scenario.contextGeo && scenario.contextGeo.trim() !== '';
    const hasTime = scenario.contextTime && scenario.contextTime.trim() !== '';
    const hasPrecond = scenario.contextPrecond && scenario.contextPrecond.trim() !== '';

    if (!hasGeo && !hasTime && !hasPrecond) {
      issues.push({
        ruleId: 'CHK-02-NULOS',
        itemControl: 'Controlar que los escenarios no posean componentes nulos',
        defectType: 'O',
        academicSeverity: 'M',
        severity: 'ERROR',
        field: 'Contexto',
        message:
          'El Contexto debe tener al menos uno de los tres componentes completado (Ubicación Geográfica, Ubicación Temporal o Precondición).',
      });
    }

    // Si NO es integrador, Actores y Recursos son requeridos
    const isIntegrator = scenario.type === 'INTEGRADOR' || scenario.rawRole === 'INTEGRADOR';
    if (!isIntegrator) {
      if (!scenario.actors || scenario.actors.length === 0) {
        issues.push({
          ruleId: 'CHK-02-NULOS',
          itemControl: 'Controlar que los escenarios no posean componentes nulos',
          defectType: 'O',
          academicSeverity: 'M',
          severity: 'ERROR',
          field: 'Actores',
          message: 'El componente Actores no puede estar vacío en un escenario no integrador.',
        });
      }

      if (!scenario.resources || scenario.resources.length === 0) {
        issues.push({
          ruleId: 'CHK-02-NULOS',
          itemControl: 'Controlar que los escenarios no posean componentes nulos',
          defectType: 'O',
          academicSeverity: 'M',
          severity: 'ERROR',
          field: 'Recursos',
          message: 'El componente Recursos no puede estar vacío en un escenario no integrador.',
        });
      }
    }
  }

  // 2. Escenario Integrador
  private checkIntegratorRules(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    const isIntegrator = scenario.type === 'INTEGRADOR' || scenario.rawRole === 'INTEGRADOR';
    if (!isIntegrator) return;

    if (scenario.actors && scenario.actors.length > 0) {
      issues.push({
        ruleId: 'CHK-INT-VACIOS',
        itemControl: 'Controlar que los componentes Recursos y Actores de un escenario integrador estén vacíos',
        defectType: 'E',
        academicSeverity: 'B',
        severity: 'ERROR',
        field: 'Actores',
        message: 'En un Escenario Integrador el componente Actores debe estar vacío.',
        suggestion: 'Remover los actores declarados en el Escenario Integrador.',
      });
    }

    if (scenario.resources && scenario.resources.length > 0) {
      issues.push({
        ruleId: 'CHK-INT-VACIOS',
        itemControl: 'Controlar que los componentes Recursos y Actores de un escenario integrador estén vacíos',
        defectType: 'E',
        academicSeverity: 'B',
        severity: 'ERROR',
        field: 'Recursos',
        message: 'En un Escenario Integrador el componente Recursos debe estar vacío.',
        suggestion: 'Remover los recursos declarados en el Escenario Integrador.',
      });
    }

    // Todos los episodios de un integrador deben ser invocaciones a sub-escenarios en MAYÚSCULAS
    if (scenario.episodes) {
      scenario.episodes.forEach((ep) => {
        const lettersOnly = ep.text.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
        const isUpper = lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase();
        if (!isUpper) {
          issues.push({
            ruleId: 'CHK-INT-SUBESCENARIOS',
            itemControl: 'Controlar que cada episodio de un escenario integrador corresponda a un título de escenario existente',
            defectType: 'O',
            academicSeverity: 'M',
            severity: 'ERROR',
            field: 'Episodios',
            line: ep.number,
            message: `Episodio ${ep.number}: Cada episodio de un escenario integrador debe ser el título de un sub-escenario existente en MAYÚSCULAS.`,
            suggestion: ep.text.toUpperCase(),
          });
        }
      });
    }
  }

  // 3. Cantidad Mínima de Episodios
  private checkMinEpisodes(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    const count = scenario.episodes ? scenario.episodes.length : 0;
    if (count < 2) {
      issues.push({
        ruleId: 'CHK-03-MIN-EPISODIOS',
        itemControl: 'Controlar que en los escenarios haya al menos dos episodios',
        defectType: 'O',
        academicSeverity: 'B',
        severity: 'ERROR',
        field: 'Episodios',
        line: -1,
        message: `El escenario debe contener al menos dos episodios. Encontrados: ${count}.`,
      });
    }
  }

  // 4. Verbo en Infinitivo en Título
  private checkTitleInfinitive(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    if (!scenario.title || scenario.title.trim() === '') return;

    const words = scenario.title.trim().split(/\s+/);
    if (words.length === 0) return;

    // Extraer primera palabra sin puntuación
    const firstWord = words[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '').toLowerCase();

    // Infinitivos regulares y enclíticos (-ar, -er, -ir, -arse, -erse, -irse, etc.)
    const infinitiveRegex = /^[a-záéíóúñ]+(ar|er|ir|arse|erse|irse|ár|ér|ír)$/i;

    if (!infinitiveRegex.test(firstWord)) {
      issues.push({
        ruleId: 'CHK-04-TITULO-INFINITIVO',
        itemControl: 'Controlar que el título del escenario utilice un verbo en infinitivo que abarque toda la situación',
        defectType: 'A',
        academicSeverity: 'M',
        severity: 'WARNING',
        field: 'Título',
        message: `El título "${scenario.title}" debe iniciar con un verbo principal en infinitivo (terminación -ar, -er, -ir).`,
        suggestion: `Reformular iniciando con un verbo en infinitivo.`,
      });
    }
  }

  // 5. Prohibición de Verbos Débiles
  private checkWeakVerbs(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    if (!scenario.episodes) return;

    // Verbos débiles prohibidos según cátedra
    const weakVerbsRegex = /\b(puede|pueden|podr[ií]a|podr[ií]an|debe|deben|deber[ií]a|deber[ií]an)\b/i;

    scenario.episodes.forEach((ep) => {
      // Validar sobre ep.text, excluyendo explícitamente la restricción
      const match = ep.text.match(weakVerbsRegex);
      if (match) {
        issues.push({
          ruleId: 'CHK-16-VERBOS-DEBILES',
          itemControl:
            'Controlar que los episodios estén descriptos en tiempo presente, sin usar verbos débiles del tipo podría, puede, debe o debería',
          defectType: 'A',
          academicSeverity: 'B',
          severity: 'ERROR',
          field: 'Episodios',
          line: ep.number,
          message: `Episodio ${ep.number}: Los episodios deben describirse en tiempo presente indicativo sin verbos débiles ("${match[0]}").`,
          suggestion: 'Redactar en presente directo de acción (ej. "El usuario ingresa", "El sistema valida").',
        });
      }
    });
  }

  // 6. Sintaxis BNF en Episodios
  private checkBnfSyntax(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    if (!scenario.episodes) return;

    scenario.episodes.forEach((ep) => {
      // 6.1 Condicionales
      if (ep.type === 'CONDITIONAL' || /^Si\b/i.test(ep.text.trim())) {
        const isValidConditional = /^Si\s+.+?\s+(?:entonces\s+|,|\bthen\b).+$/i.test(ep.text.trim());
        if (!isValidConditional) {
          issues.push({
            ruleId: 'CHK-17-BNF-CONDICIONAL',
            itemControl: 'Controlar que los episodios condicionales usen la sintaxis: Si + condición + [entonces] + oración del episodio',
            defectType: 'E',
            academicSeverity: 'B',
            severity: 'ERROR',
            field: 'Episodios',
            line: ep.number,
            message: `Episodio ${ep.number}: Episodio condicional debe cumplir la sintaxis "Si <condición> entonces <acción>" o "Si <condición>, <acción>".`,
            suggestion: `Si <condición> entonces <acción>`,
          });
        }
      }

      // 6.2 Optativos
      if (ep.type === 'OPTIONAL' || ep.text.includes('[') || ep.text.includes(']')) {
        const openBrackets = (ep.text.match(/\[/g) || []).length;
        const closeBrackets = (ep.text.match(/\]/g) || []).length;
        const isBracketEnclosed = /^\[[^\]]+\]$/.test(ep.text.trim());

        if (openBrackets !== closeBrackets || !isBracketEnclosed) {
          issues.push({
            ruleId: 'CHK-18-BNF-OPTATIVO',
            itemControl: 'Controlar que los episodios optativos usen la sintaxis: [oración del episodio]',
            defectType: 'E',
            academicSeverity: 'B',
            severity: 'ERROR',
            field: 'Episodios',
            line: ep.number,
            message: `Episodio ${ep.number}: Episodio optativo debe tener corchetes balanceados encerrando la acción: "[oración del episodio]".`,
            suggestion: `[${ep.text.replace(/[\[\]]/g, '').trim()}]`,
          });
        }
      }

      // 6.3 No Secuenciales
      if (ep.type === 'NON_SEQUENTIAL' || ep.rawText.includes('#')) {
        const hashCount = (ep.rawText.match(/#/g) || []).length;
        const trimmedRaw = ep.rawText.trim();
        const startsWithHash = trimmedRaw.startsWith('#');
        const endsWithHash = trimmedRaw.endsWith('#');

        if (hashCount < 2 || hashCount % 2 !== 0 || !startsWithHash || !endsWithHash) {
          issues.push({
            ruleId: 'CHK-19-BNF-NO-SECUENCIAL',
            itemControl:
              'Controlar que los episodios no secuenciales usen la sintaxis: # al comienzo y al final de un grupo de 2 o más episodios',
            defectType: 'E',
            academicSeverity: 'B',
            severity: 'ERROR',
            field: 'Episodios',
            line: ep.number,
            message: `Episodio ${ep.number}: Bloque no secuencial (#...#) no está balanceado. Falta token de cierre '#'.`,
            suggestion: `# ${ep.rawText.replace(/#/g, '').trim()} #`,
          });
        } else {
          // Verificar que agrupe al menos 2 oraciones / acciones
          const innerContent = ep.rawText.replace(/^#|#$/g, '').trim();
          const innerLines = innerContent
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

          if (innerLines.length < 2) {
            // Verificar si hay punto y coma o oraciones separadas
            const innerSentences = innerContent
              .split(/[\.;]/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

            if (innerSentences.length < 2) {
              issues.push({
                ruleId: 'CHK-19-BNF-NO-SECUENCIAL',
                itemControl:
                  'Controlar que los episodios no secuenciales usen la sintaxis: # al comienzo y al final de un grupo de 2 o más episodios',
                defectType: 'E',
                academicSeverity: 'B',
                severity: 'ERROR',
                field: 'Episodios',
                line: ep.number,
                message: `Episodio ${ep.number}: Un bloque no secuencial debe agrupar al menos dos episodios o acciones.`,
              });
            }
          }
        }
      }
    });
  }

  // 7. Estructura Causa-Tratamiento en Excepciones
  private checkExceptionStructure(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    if (!scenario.exceptions || scenario.exceptions.length === 0) return;

    scenario.exceptions.forEach((exc, idx) => {
      const hasCausa = exc.causa && exc.causa.trim() !== '';
      const hasTratamiento = exc.tratamiento && exc.tratamiento.trim() !== '';

      if (!hasCausa || !hasTratamiento) {
        issues.push({
          ruleId: 'CHK-25-EXCEPCION-ESTRUCTURA',
          itemControl:
            'Controlar que toda excepción de un escenario tenga una causa (condición que impide cumplir el objetivo) y un tratamiento (acción simple o un escenario excepción)',
          defectType: 'O',
          academicSeverity: 'M',
          severity: 'ERROR',
          field: 'Excepciones',
          line: idx + 1,
          message: `Excepción ${idx + 1}: Toda excepción debe tener tanto Causa como Tratamiento definidos.`,
          suggestion: 'Causa: <condición que impide el objetivo>. Tratamiento: <acción o escenario>.',
        });
      }
    });
  }

  // 8. Mención de Actores en Episodios
  private checkActorsMention(scenario: ScenarioStructure, issues: DeterministicIssue[]): void {
    const isIntegrator = scenario.type === 'INTEGRADOR' || scenario.rawRole === 'INTEGRADOR';
    if (isIntegrator || !scenario.actors || scenario.actors.length === 0) return;

    // Si todos los episodios son sub-escenarios en mayúsculas, los actores no necesariamente ejecutan acciones directamente aquí
    const allSubScenarios =
      scenario.episodes &&
      scenario.episodes.length > 0 &&
      scenario.episodes.every((ep) => ep.type === 'SUB_SCENARIO');
    if (allSubScenarios) return;

    const episodesCorpus = (scenario.episodes || []).map((e) => e.rawText).join(' ');
    const exceptionsCorpus = (scenario.exceptions || []).map((e) => `${e.causa} ${e.tratamiento}`).join(' ');
    const fullText = `${episodesCorpus} ${exceptionsCorpus}`.toLowerCase();

    scenario.actors.forEach((actor) => {
      const actorLower = actor.toLowerCase().trim();
      if (!actorLower) return;

      if (!fullText.includes(actorLower)) {
        issues.push({
          ruleId: 'CHK-ACTORES-MENCION',
          itemControl:
            'Controlar que en el componente Actores solamente estén aquellos que participan en los episodios del escenario',
          defectType: 'D',
          academicSeverity: 'B',
          severity: 'WARNING',
          field: 'Actores',
          message: `Actor "${actor}" declarado pero no mencionado en episodios o excepciones.`,
          suggestion: 'Verificar si el actor participa activamente en el escenario o si debe removerse de la lista de Actores.',
        });
      }
    });
  }
}
