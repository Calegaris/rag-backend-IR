import { Injectable, BadRequestException } from '@nestjs/common';
import {
  EpisodeParsed,
  EpisodeType,
  PrismaScenarioType,
  ScenarioException,
  ScenarioStructure,
  TemplateScenarioRole,
} from './parser.types';

@Injectable()
export class MarkdownParserService {
  parse(rawMarkdown: string): ScenarioStructure {
    if (!rawMarkdown || rawMarkdown.trim() === '') {
      throw new BadRequestException('El markdown provisto está vacío.');
    }

    const normalized = rawMarkdown.replace(/\r\n/g, '\n');

    // 1. Extraer Título y Número de Escenario
    const { title, scenarioNumber } = this.extractTitle(normalized);

    // 2. Extraer Tipo / Rol
    const { type, rawRole } = this.extractTypeAndRole(normalized);

    // 3. Extraer Objetivo
    const objective = this.extractObjective(normalized);

    // 4. Extraer Contexto (Ubicación Geográfica, Temporal, Precondición)
    const { contextGeo, contextTime, contextPrecond } = this.extractContext(normalized);

    // 5. Extraer Actores y Recursos
    const actors = this.extractList(normalized, 'Actores');
    const resources = this.extractList(normalized, 'Recursos');

    // 6. Extraer Episodios
    const episodes = this.extractEpisodes(normalized);

    // 7. Extraer Excepciones
    const exceptions = this.extractExceptions(normalized);

    // Verificación estructural mínima para evitar markdowns espurios
    if (!title && !objective && episodes.length === 0) {
      throw new BadRequestException(
        'Markdown malformado: no se encontró estructura reconocible de escenario (falta título, objetivo o episodios).',
      );
    }

    return {
      title,
      type,
      rawRole,
      scenarioNumber,
      objective,
      contextGeo,
      contextTime,
      contextPrecond,
      actors,
      resources,
      episodes,
      exceptions,
      rawMarkdown,
    };
  }

  private isEmptyValue(val: string | null | undefined): boolean {
    if (!val) return true;
    const clean = val.replace(/\*\*/g, '').trim();
    if (clean === '') return true;
    return /^(?:--|—|\(en blanco\)|\(vac[ií]o\)|\(vacio\)|\(nulo\)|nulo|-|none)$/i.test(clean);
  }

  private cleanValue(val: string | null | undefined): string | null {
    if (this.isEmptyValue(val)) return null;
    return val ? val.replace(/\*\*/g, '').trim() : null;
  }

  private extractTitle(text: string): { title: string; scenarioNumber?: number } {
    let title = '';
    let scenarioNumber: number | undefined;

    // Buscar "Escenario Nº: 1" o "Escenario Nro: 1" o "# Escenario 1:"
    const escNumMatch = text.match(/(?:Escenario\s+(?:N[rroº°\.]*|#)\s*:?\s*(\d+))/i);
    if (escNumMatch) {
      scenarioNumber = parseInt(escNumMatch[1], 10);
    }

    // Formato 1: "Título: <texto>" o "Titulo: <texto>" o "**Título:** <texto>"
    const titleMatch = text.match(
      /(?:^|\n)\s*(?:\*\*)?(?:T[ií]tulo(?:\s+del\s+Escenario)?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im,
    );
    if (titleMatch) {
      title = titleMatch[1].replace(/\*\*/g, '').trim();
    } else {
      // Formato 2: Encabezado H1 "# <TÍTULO>" (descartando encabezados genéricos como "# ESCENARIOS")
      const lines = text.split('\n');
      for (const line of lines) {
        const h1Match = line.match(/^\s*#\s+([^#].*)$/);
        if (h1Match) {
          const candidate = h1Match[1].replace(/\*\*/g, '').trim();
          if (!/^(?:ESCENARIOS|DESCRIPCI[OÓ]N DE ESCENARIOS|LISTA DE ESCENARIOS)$/i.test(candidate)) {
            title = candidate;
            break;
          }
        }
      }
    }

    return { title: title.trim(), scenarioNumber };
  }

  private extractTypeAndRole(text: string): { type: PrismaScenarioType; rawRole: TemplateScenarioRole } {
    let rawRole = 'Particular';

    const typeMatch = text.match(
      /(?:^|\n)\s*(?:\*\*)?(?:Tipo(?:\s+de\s+escenario)?|Rol)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im,
    );
    if (typeMatch) {
      rawRole = typeMatch[1].replace(/\*\*/g, '').trim();
    }

    const upper = rawRole.toUpperCase();
    let type: PrismaScenarioType = 'ACTUAL';

    if (upper.includes('INTEGRADOR')) {
      type = 'INTEGRADOR';
      rawRole = 'INTEGRADOR';
    } else if (upper.includes('FUTURO')) {
      type = 'FUTURO';
      rawRole = 'FUTURO';
    } else if (upper.includes('SUB-ESCENARIO') || upper.includes('SUB_ESCENARIO') || upper.includes('SUBESCENARIO')) {
      type = 'ACTUAL';
      rawRole = 'SUB_ESCENARIO';
    } else if (upper.includes('EXCEPCION') || upper.includes('EXCEPCIÓN')) {
      type = 'ACTUAL';
      rawRole = 'EXCEPCION';
    } else if (upper.includes('PARTICULAR') || upper.includes('ACTUAL')) {
      type = 'ACTUAL';
      rawRole = 'PARTICULAR';
    }

    return { type, rawRole };
  }

  private extractObjective(text: string): string {
    const match = text.match(
      /(?:^|\n)\s*(?:\*\*)?Objetivo(?:\*\*)?\s*:\s*(?:\*\*)?\s*([\s\S]*?)(?=(?:\n\s*(?:\*\*|#{1,3}\s*)?(?:Contexto|Ubicaci[oó]n|Precondici[oó]n|Actores|Recursos|Episodios|Excepciones)|$))/i,
    );
    if (!match) return '';
    const clean = match[1].replace(/\*\*/g, '').trim();
    return this.isEmptyValue(clean) ? '' : clean;
  }

  private extractContext(text: string): {
    contextGeo: string | null;
    contextTime: string | null;
    contextPrecond: string | null;
  } {
    let contextGeo: string | null = null;
    let contextTime: string | null = null;
    let contextPrecond: string | null = null;

    // Buscar bloque "Contexto:"
    const contextBlockMatch = text.match(
      /(?:^|\n)\s*(?:\*\*)?Contexto(?:\*\*)?\s*:?([\s\S]*?)(?=(?:\n\s*(?:\*\*|#{1,3}\s*)?(?:Recursos|Actores|Episodios|Excepciones)|$))/i,
    );
    const searchArea = contextBlockMatch ? contextBlockMatch[1] : text;

    // Ubicación Geográfica
    const geoMatch = searchArea.match(
      /(?:^|\n)\s*(?:-\s*)?(?:\*\*)?(?:Ubicaci[oó]n\s+Geogr[aá]fica|Geogr[aá]fica)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im,
    );
    if (geoMatch) {
      contextGeo = this.cleanValue(geoMatch[1].replace(/\*\*/g, ''));
    }

    // Ubicación Temporal
    const timeMatch = searchArea.match(
      /(?:^|\n)\s*(?:-\s*)?(?:\*\*)?(?:Ubicaci[oó]n\s+Temporal|Temporal)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/im,
    );
    if (timeMatch) {
      contextTime = this.cleanValue(timeMatch[1].replace(/\*\*/g, ''));
    }

    // Precondiciones
    const precondMatch = searchArea.match(
      /(?:^|\n)\s*(?:-\s*)?(?:\*\*)?Precondici[oó]n(?:es)?(?:\*\*)?\s*:\s*(?:\*\*)?\s*([\s\S]*?)(?=(?:\n\s*(?:-\s*)?(?:\*\*)?(?:Ubicaci[oó]n|Recursos|Actores|Episodios|Excepciones)|$))/i,
    );
    if (precondMatch) {
      const rawPrecond = precondMatch[1].trim();
      const cleanedLines = rawPrecond
        .split('\n')
        .map((l) => l.replace(/^\s*[●*•\-]\s*/, '').replace(/\*\*/g, '').trim())
        .filter((l) => l.length > 0 && !this.isEmptyValue(l));

      if (cleanedLines.length > 0) {
        contextPrecond = cleanedLines.join('\n');
      } else if (!this.isEmptyValue(rawPrecond)) {
        contextPrecond = rawPrecond.replace(/\*\*/g, '').trim();
      }
    }

    return { contextGeo, contextTime, contextPrecond };
  }

  private extractList(text: string, sectionName: 'Actores' | 'Recursos'): string[] {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*(?:\\*\\*)?${sectionName}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:\\*\\*|#{1,3}\\s*)?(?:Actores|Recursos|Contexto|Episodios|Excepciones)|$))`,
      'i',
    );
    const match = text.match(pattern);
    if (!match) return [];

    const rawContent = match[1].trim();
    if (this.isEmptyValue(rawContent)) return [];

    // Si viene en lista multilínea con viñetas o saltos de línea
    const lines = rawContent
      .split('\n')
      .map((l) => l.replace(/^\s*[●*•\-]\s*/, '').replace(/\*\*/g, '').replace(/^\*+|\*+$/g, '').trim())
      .filter((l) => l.length > 0 && !this.isEmptyValue(l));

    // Si había múltiples líneas con viñetas
    if (lines.length > 1 || (lines.length === 1 && /^[●*•\-]/.test(rawContent))) {
      return lines;
    }

    // Si viene en una sola línea separada por comas: "Cajero, Solicitante"
    return rawContent
      .split(',')
      .map((item) => item.replace(/^\s*[●*•\-]\s*/, '').replace(/\*\*/g, '').replace(/^\*+|\*+$/g, '').trim())
      .filter((item) => item.length > 0 && !this.isEmptyValue(item));
  }

  private extractEpisodes(text: string): EpisodeParsed[] {
    const match = text.match(
      /(?:^|\n)\s*(?:\*\*)?Episodios(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:\*\*|#{1,3}\s*)?Excepciones|$))/i,
    );
    if (!match) return [];

    const rawEpisodesSection = match[1].trim();
    if (this.isEmptyValue(rawEpisodesSection)) return [];

    const lines = rawEpisodesSection.split('\n');
    const episodes: EpisodeParsed[] = [];
    let currentNumber: number | null = null;
    let currentRawLines: string[] = [];

    const flushCurrent = () => {
      if (currentNumber !== null && currentRawLines.length > 0) {
        const rawText = currentRawLines.join('\n').trim();
        const parsed = this.parseSingleEpisode(currentNumber, rawText);
        episodes.push(parsed);
      }
      currentNumber = null;
      currentRawLines = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Buscar si empieza con número de episodio: "1.", "2)", "1 -"
      const numMatch = trimmed.match(/^(\d+)[\.\)\-]\s*(.*)$/);
      if (numMatch) {
        flushCurrent();
        currentNumber = parseInt(numMatch[1], 10);
        currentRawLines = [numMatch[2].trim()];
      } else if (currentNumber !== null) {
        currentRawLines.push(trimmed);
      }
    }

    flushCurrent();
    return episodes;
  }

  private parseSingleEpisode(number: number, rawText: string): EpisodeParsed {
    let cleanText = rawText;
    let restriction: string | undefined;

    // 1. Extraer anotaciones de ayuda de tests: "[← ERROR ...]"
    cleanText = cleanText.replace(/\s*\[←[^\]]+\]/g, '').trim();

    // 2. Extraer restricción: "[Restricción: ...]" o 'Restricción: “...”'
    const bracketRestrMatch = cleanText.match(/\[\s*Restricci[oó]n:\s*(.+?)\]/i);
    if (bracketRestrMatch) {
      restriction = bracketRestrMatch[1].replace(/^[“"']+|[.”"']+$/g, '').trim();
      cleanText = cleanText.replace(bracketRestrMatch[0], '').trim();
    } else {
      const inlineRestrMatch = cleanText.match(/(?:(,\s*)|\.\s*|\s+)Restricci[oó]n:\s*[“"']?(.+?)[”"']?$/i);
      if (inlineRestrMatch) {
        const fullMatch = inlineRestrMatch[0];
        const hadDot = fullMatch.startsWith('.');
        const hadComma = fullMatch.startsWith(',');
        restriction = inlineRestrMatch[2].replace(/^[“"']+|[.”"']+$/g, '').trim();
        cleanText = cleanText.slice(0, inlineRestrMatch.index).trim();
        if (hadDot && !cleanText.endsWith('.')) {
          cleanText += '.';
        } else if (hadComma && !cleanText.endsWith(',')) {
          cleanText += ',';
        }
      }
    }

    // 3. Determinar tipo de episodio
    let type: EpisodeType = 'SIMPLE';

    if (rawText.includes('#')) {
      type = 'NON_SEQUENTIAL';
    } else if (/^\[.+\]$/.test(cleanText.trim())) {
      type = 'OPTIONAL';
    } else if (/^Si\b/i.test(cleanText.trim())) {
      type = 'CONDITIONAL';
    } else {
      // Sub-escenario en mayúsculas
      const lettersOnly = cleanText.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
      if (lettersOnly.length > 2 && lettersOnly === lettersOnly.toUpperCase()) {
        type = 'SUB_SCENARIO';
      } else {
        type = 'SIMPLE';
      }
    }

    return {
      number,
      text: cleanText.trim(),
      restriction,
      type,
      rawText,
    };
  }

  private extractExceptions(text: string): ScenarioException[] {
    const match = text.match(/(?:^|\n)\s*(?:\*\*)?Excepciones(?:\*\*)?\s*:\s*([\s\S]*?)$/i);
    if (!match) return [];

    const rawExceptions = match[1].trim();
    if (this.isEmptyValue(rawExceptions)) return [];

    const exceptions: ScenarioException[] = [];

    // Formato 1: "Causa: <causa>. Tratamiento: <tratamiento>" (oficial en una o múltiples líneas)
    const regexOficial =
      /Causa:\s*([\s\S]+?)(?=(?:\r?\n\s*|\s+)(?:Tratamiento|Soluci[oó]n)\s*:)\s*(?:Tratamiento|Soluci[oó]n)\s*:\s*([\s\S]+?)(?=(?:\n\s*Causa:|$))/gi;
    let matchOficial: RegExpExecArray | null;
    while ((matchOficial = regexOficial.exec(rawExceptions)) !== null) {
      const causa = matchOficial[1].replace(/^[●*•\-]\s*/, '').replace(/\*\*/g, '').trim();
      const tratamiento = matchOficial[2].replace(/^[●*•\-]\s*/, '').replace(/\*\*/g, '').trim();
      if (!this.isEmptyValue(causa) || !this.isEmptyValue(tratamiento)) {
        exceptions.push({ causa, tratamiento, rawText: matchOficial[0].trim() });
      }
    }

    if (exceptions.length > 0) return exceptions;

    // Formato 2: Viñetas tipo "- [Causa]: [Tratamiento]" o "- Causa: Tratamiento" o "- Causa: <texto>"
    const lines = rawExceptions.split('\n');
    for (const line of lines) {
      const trimmed = line.replace(/^\s*[●*•\-]\s*/, '').replace(/\*\*/g, '').trim();
      if (!trimmed || this.isEmptyValue(trimmed)) continue;

      // Si la línea solo especifica Causa sin Tratamiento (ej. "- Causa: Corte de luz")
      if (/^Causa\s*:/i.test(trimmed) && !/(?:Tratamiento|Soluci[oó]n)\s*:/i.test(trimmed)) {
        const causaOnly = trimmed.replace(/^Causa\s*:\s*/i, '').trim();
        exceptions.push({
          causa: causaOnly,
          tratamiento: '',
          rawText: trimmed,
        });
        continue;
      }

      // Si tiene "Causa: X. Tratamiento: Y" en una sola línea
      const inlineMatch = trimmed.match(
        /^Causa\s*:\s*(.+?)\s*[\.;]\s*(?:Tratamiento|Soluci[oó]n)\s*:\s*(.+)$/i,
      );
      if (inlineMatch) {
        exceptions.push({
          causa: inlineMatch[1].trim(),
          tratamiento: inlineMatch[2].trim(),
          rawText: trimmed,
        });
        continue;
      }

      // Formato con dos puntos separador: "- Causa: Tratamiento" o "- [Causa]: [Tratamiento]"
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const part1 = trimmed.slice(0, colonIndex).replace(/^\[|\]$/g, '').trim();
        const part2 = trimmed.slice(colonIndex + 1).replace(/^\[|\]$/g, '').trim();
        exceptions.push({
          causa: part1.replace(/^Causa\s*:\s*/i, ''),
          tratamiento: part2.replace(/^(?:Tratamiento|Soluci[oó]n)\s*:\s*/i, ''),
          rawText: trimmed,
        });
      }
    }

    return exceptions;
  }
}
