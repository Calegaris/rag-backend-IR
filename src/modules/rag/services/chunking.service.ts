import { Injectable } from '@nestjs/common';

export interface MarcoTeoricoChunkMetadata {
  sourceType: 'MARCO_TEORICO';
  docId: string;
  filename: string;
  title: string;
  category: string;
  sectionHeading: string;
  checklistCodes: string[];
  keywords: string[];
  targetComponents: string[];
  scenarioTypes: string[];
}

export interface LelChunkMetadata {
  sourceType: 'LEL';
  projectName: string;
  symbolNumber: number;
  symbolName: string;
  category: string;
  nocion: string;
  impacto: string;
}

export interface RagChunk<TMetadata = Record<string, any>> {
  content: string;
  metadata: TMetadata;
}

interface ParsedFrontmatter {
  id?: string;
  title?: string;
  category?: string;
  checklistCodes: string[];
  keywords: string[];
  targetComponents: string[];
  scenarioTypes: string[];
}

@Injectable()
export class ChunkingService {
  private static readonly MAX_SECTION_CHARS = 2500;

  chunkMarcoTeoricoFile(
    filename: string,
    rawMarkdown: string,
  ): RagChunk<MarcoTeoricoChunkMetadata>[] {
    if (!rawMarkdown || rawMarkdown.trim() === '') {
      return [];
    }

    const normalized = rawMarkdown.replace(/\r\n/g, '\n');
    const { frontmatter, body } = this.extractFrontmatter(normalized);

    const docId = frontmatter.id || filename.replace(/\.md$/i, '');
    const title =
      frontmatter.title ||
      this.extractH1(body) ||
      filename.replace(/\.md$/i, '');
    const targetComponents = frontmatter.targetComponents;
    const scenarioTypes = frontmatter.scenarioTypes;
    const category =
      frontmatter.category ||
      (targetComponents.length > 0 ? targetComponents.join(', ') : 'General');
    const checklistCodes = frontmatter.checklistCodes;
    const keywords = frontmatter.keywords;

    // Remove leading H1 line from body before splitting into H2 sections
    const bodyWithoutH1 = body.replace(/^\s*#\s+[^\n]+\n*/, '').trim();
    if (!bodyWithoutH1) {
      return [];
    }

    const rawSections = bodyWithoutH1
      .split(/^(?=##\s+)/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const chunks: RagChunk<MarcoTeoricoChunkMetadata>[] = [];

    for (const section of rawSections) {
      const h2Match = section.match(/^##\s+([^\n]+)\n?([\s\S]*)$/);
      const sectionHeading = h2Match ? h2Match[1].trim() : 'Introducción';
      const rawSectionBody = h2Match ? h2Match[2] : section;
      const cleanedBody = this.cleanHorizontalRules(rawSectionBody);

      if (!cleanedBody) {
        continue;
      }

      if (
        section.length > ChunkingService.MAX_SECTION_CHARS &&
        /^###\s+/m.test(cleanedBody)
      ) {
        const subSections = cleanedBody
          .split(/^(?=###\s+)/m)
          .map((sub) => sub.trim())
          .filter((sub) => sub.length > 0);

        for (const sub of subSections) {
          const h3Match = sub.match(/^###\s+([^\n]+)\n?([\s\S]*)$/);
          const subHeading = h3Match
            ? `${sectionHeading} - ${h3Match[1].trim()}`
            : sectionHeading;
          const subContent = this.cleanHorizontalRules(sub);
          if (!subContent) continue;

          chunks.push({
            content: `[Marco Teórico: ${title} | Categoría: ${category} | Sección: ${subHeading}]\n${subContent}`,
            metadata: {
              sourceType: 'MARCO_TEORICO',
              docId,
              filename,
              title,
              category,
              sectionHeading: subHeading,
              checklistCodes,
              keywords,
              targetComponents,
              scenarioTypes,
            },
          });
        }
      } else {
        const fullSectionText = this.cleanHorizontalRules(section);
        chunks.push({
          content: `[Marco Teórico: ${title} | Categoría: ${category} | Sección: ${sectionHeading}]\n${fullSectionText}`,
          metadata: {
            sourceType: 'MARCO_TEORICO',
            docId,
            filename,
            title,
            category,
            sectionHeading,
            checklistCodes,
            keywords,
            targetComponents,
            scenarioTypes,
          },
        });
      }
    }

    return chunks;
  }

  chunkLelMarkdown(
    projectName: string,
    rawLelMarkdown: string,
  ): RagChunk<LelChunkMetadata>[] {
    if (!rawLelMarkdown || rawLelMarkdown.trim() === '') {
      return [];
    }

    const normalized = rawLelMarkdown.replace(/\r\n/g, '\n');

    // Format A: Structured ### Símbolo blocks
    const structuredChunks = this.parseStructuredLelBlocks(
      projectName,
      normalized,
    );
    if (structuredChunks.length > 0) {
      return structuredChunks;
    }

    // Format B: Labeled Símbolo blocks (Símbolo N°... Nombre:... Tipo:... Noción:... Impacto:...)
    const labeledChunks = this.parseLabeledSymbolBlocks(
      projectName,
      normalized,
    );
    if (labeledChunks.length > 0) {
      return labeledChunks;
    }

    // Format C: Freeform descriptive blocks (Nombre (O|S|V|E|Objeto|Sujeto|Verbo|Estado) + Noción + Impacto)
    const freeformChunks = this.parseFreeformLelBlocks(projectName, normalized);
    if (freeformChunks.length > 0) {
      return freeformChunks;
    }

    // Format D: Tabular/Transcript blocks (Símbolo Nº... Tipo... Nombre... Noción... Impacto...)
    const tabularChunks = this.parseTabularTranscriptLelBlocks(
      projectName,
      normalized,
    );
    if (tabularChunks.length > 0) {
      return tabularChunks;
    }

    // Format E: Compact bullet list (- Nombre (Tipo): Noción / Impacto)
    return this.parseCompactLelList(projectName, normalized);
  }

  private parseStructuredLelBlocks(
    projectName: string,
    text: string,
  ): RagChunk<LelChunkMetadata>[] {
    const blocks = text.split(/^(?=###\s+)/m);
    const chunks: RagChunk<LelChunkMetadata>[] = [];
    let autoIncrementNumber = 1;

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed.startsWith('###')) {
        continue;
      }

      const headerMatch = trimmed.match(/^###\s+([^\n]+)\n([\s\S]*)$/);
      if (!headerMatch) {
        continue;
      }

      const rawHeader = headerMatch[1].replace(/\*\*/g, '').trim();
      // Cut block body if a new ## heading appears later
      const rawBody = headerMatch[2].split(/\n##\s+/)[0];

      // Check if block has Noción or Impacto fields
      const hasLelFields =
        /(?:Noci[oó]n|Impacto)\s*:/i.test(rawBody) ||
        /^S[ií]mbolo\b/i.test(rawHeader);
      if (!hasLelFields) {
        continue;
      }

      let symbolNumber = autoIncrementNumber;
      let symbolName = rawHeader;
      let inlineCategory = '';

      // Parse "Símbolo Nº 1: Acorde a derecho" or "1. Acorde a derecho"
      const symbolHeaderMatch = rawHeader.match(
        /^(?:S[ií]mbolo\s*(?:N[º°ro\.]*|#)?\s*(\d+)\s*:\s*|(\d+)[\.\)\-]\s*)(.+)$/i,
      );
      if (symbolHeaderMatch) {
        const parsedNum = parseInt(
          symbolHeaderMatch[1] || symbolHeaderMatch[2],
          10,
        );
        if (!Number.isNaN(parsedNum)) {
          symbolNumber = parsedNum;
        }
        symbolName = symbolHeaderMatch[3].trim();
      }

      // Check if header ends with "(Sujeto|Objeto|Verbo|Estado)"
      const headerCatMatch = symbolName.match(
        /^(.+?)\s*[\(\[](Sujeto|Objeto|Verbo|Estado)[\)\]]$/i,
      );
      if (headerCatMatch) {
        symbolName = headerCatMatch[1].trim();
        inlineCategory = headerCatMatch[2].trim();
      }

      // Extract Tipo / Categoría
      const categoryMatch = rawBody.match(
        /(?:^|\n)\s*(?:[-*•●]\s*)?(?:\*\*)?(?:Tipo|Categor[ií]a)(?:\*\*)?\s*:\s*(?:\*\*)?\s*([^\n]+)/i,
      );
      const category = categoryMatch
        ? categoryMatch[1].replace(/\*\*/g, '').trim()
        : inlineCategory || 'No especificado';

      // Extract Noción
      const nocionMatch = rawBody.match(
        /(?:^|\n)\s*(?:[-*•●]\s*)?(?:\*\*)?Noci[oó]n(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:[-*•●]\s*)?(?:\*\*)?Impacto(?:\*\*)?\s*:|\n\s*---|$))/i,
      );
      const nocion = nocionMatch
        ? this.cleanMultilineField(nocionMatch[1])
        : '';

      // Extract Impacto
      const impactoMatch = rawBody.match(
        /(?:^|\n)\s*(?:[-*•●]\s*)?(?:\*\*)?Impacto(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\n\s*---|$))/i,
      );
      const impacto = impactoMatch
        ? this.cleanMultilineField(impactoMatch[1])
        : '';

      if (!symbolName || (!nocion && !impacto)) {
        continue;
      }

      const content = `Símbolo LEL: ${symbolName}\nCategoría: ${category}\nNoción: ${nocion}\nImpacto: ${impacto}`;
      chunks.push({
        content,
        metadata: {
          sourceType: 'LEL',
          projectName,
          symbolNumber,
          symbolName,
          category,
          nocion,
          impacto,
        },
      });
      autoIncrementNumber = symbolNumber + 1;
    }

    return chunks;
  }

  private parseLabeledSymbolBlocks(
    projectName: string,
    text: string,
  ): RagChunk<LelChunkMetadata>[] {
    const blocks = text.split(
      /\n+(?=(?:\*\*|\*|#{1,4}\s*)?S[ií]mbolo[^\n\r]*?\d+)/i,
    );
    const chunks: RagChunk<LelChunkMetadata>[] = [];
    let autoNumber = 1;

    for (const b of blocks) {
      const trimmed = b.trim();
      if (!/(?:S[ií]mbolo)/i.test(trimmed)) continue;

      const numMatch = trimmed.match(/S[ií]mbolo[^\n\r]*?(\d+)/i);
      const nameMatch = trimmed.match(
        /(?:^|\n)\s*(?:\*\*)?Nombre(?:\/s)?(?:\*\*)?\s*:\s*(?:\*\*)?\s*([^\n\r]+)/i,
      );
      const typeMatch = trimmed.match(
        /(?:^|\n)\s*(?:\*\*)?(?:Tipo|Categor[ií]a)(?:\*\*)?\s*:\s*(?:\*\*)?\s*([^\n\r]+)/i,
      );
      const nocionMatch = trimmed.match(
        /(?:^|\n)\s*(?:\*\*)?Noci[oó]n(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\n\s*(?:\*\*)?Impacto(?:\*\*)?\s*:|$))/i,
      );
      const impactoMatch = trimmed.match(
        /(?:^|\n)\s*(?:\*\*)?Impacto(?:\*\*)?\s*:\s*([\s\S]*?)$/i,
      );

      const parsedNum = numMatch ? parseInt(numMatch[1], 10) : autoNumber;
      const symbolNumber = Number.isNaN(parsedNum) ? autoNumber : parsedNum;

      let rawName = nameMatch ? nameMatch[1].replace(/\*\*/g, '').trim() : '';
      if (!rawName) {
        const headerNameMatch = trimmed.match(
          /^(?:[#*`\s]*)?S[ií]mbolo[^\n\r:]*?:\s*(?:\*\*)?([^\n\r]+)/i,
        );
        if (headerNameMatch && !/^\d+$/.test(headerNameMatch[1].trim())) {
          rawName = headerNameMatch[1].replace(/\*\*/g, '').trim();
        }
      }

      const rawCategory = typeMatch
        ? typeMatch[1].replace(/\*\*/g, '').trim()
        : 'No especificado';
      const nocion = nocionMatch
        ? this.cleanMultilineField(nocionMatch[1])
        : '';
      const impacto = impactoMatch
        ? this.cleanMultilineField(impactoMatch[1])
        : '';

      if (!rawName || (!nocion && !impacto)) continue;

      const category = this.normalizeCategory(rawCategory);
      const content = `Símbolo LEL: ${rawName}\nCategoría: ${category}\nNoción: ${nocion}\nImpacto: ${impacto}`;

      chunks.push({
        content,
        metadata: {
          sourceType: 'LEL',
          projectName,
          symbolNumber,
          symbolName: rawName,
          category,
          nocion,
          impacto,
        },
      });
      autoNumber++;
    }

    return chunks;
  }

  private parseCompactLelList(
    projectName: string,
    text: string,
  ): RagChunk<LelChunkMetadata>[] {
    const lines = text.split('\n');
    const chunks: RagChunk<LelChunkMetadata>[] = [];
    let symbolNumber = 1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(
        /^(?:[-*•●]|\d+[\.\)])\s*(?:\*\*)?([^(*\[:\n]+?)(?:\*\*)?\s*[\(\[](Sujeto|Objeto|Verbo|Estado)[\)\]]\s*(?:\*\*)?\s*:\s*(.+)$/i,
      );
      if (!match) continue;

      const symbolName = match[1].replace(/\*\*/g, '').trim();
      const category = this.normalizeCategory(match[2].trim());
      const rest = match[3].trim();

      let nocion = rest;
      let impacto = 'No especificado';

      const splitImpacto = rest.match(
        /^(?:(?:\*\*)?Noci[oó]n(?:\*\*)?\s*:\s*)?([\s\S]+?)\s*(?:[\.\-;\/]\s*|\s+)(?:\*\*)?Impacto(?:\*\*)?\s*:\s*([\s\S]+)$/i,
      );
      if (splitImpacto) {
        nocion = splitImpacto[1].replace(/\*\*/g, '').trim();
        impacto = splitImpacto[2].replace(/\*\*/g, '').trim();
      } else {
        nocion = rest
          .replace(/^(?:\*\*)?Noci[oó]n(?:\*\*)?\s*:\s*/i, '')
          .replace(/\*\*/g, '')
          .trim();
      }

      const content = `Símbolo LEL: ${symbolName}\nCategoría: ${category}\nNoción: ${nocion}\nImpacto: ${impacto}`;
      chunks.push({
        content,
        metadata: {
          sourceType: 'LEL',
          projectName,
          symbolNumber,
          symbolName,
          category,
          nocion,
          impacto,
        },
      });
      symbolNumber++;
    }

    return chunks;
  }

  private parseFreeformLelBlocks(
    projectName: string,
    text: string,
  ): RagChunk<LelChunkMetadata>[] {
    const chunks: RagChunk<LelChunkMetadata>[] = [];
    const regex =
      /(?:^|\n)([^\n\r#\-*•●]+?)\s*[\(\[]([OSVE]|Objeto|Sujeto|Verbo|Estado)[\)\]]\s*\n+([ \t]*Noci[oó]n:?[\s\S]*?)(?=(?:\n[^\n\r#\-*•●]+?\s*[\(\[]([OSVE]|Objeto|Sujeto|Verbo|Estado)[\)\]]\s*\n+[ \t]*Noci[oó]n:?)|$)/gi;

    let match: RegExpExecArray | null;
    let symbolNumber = 1;

    while ((match = regex.exec(text)) !== null) {
      const rawName = match[1].replace(/\*\*/g, '').trim();
      const rawCategory = match[2].trim();
      const rawBody = match[3].trim();

      const niMatch = rawBody.match(
        /Noci[oó]n:?\s*([\s\S]*?)(?=(?:Impacto:?|$))(?:Impacto:?\s*([\s\S]*))?/i,
      );

      const nocion =
        niMatch && niMatch[1] ? this.cleanMultilineField(niMatch[1]) : '';
      const impacto =
        niMatch && niMatch[2] ? this.cleanMultilineField(niMatch[2]) : '';

      if (!rawName || (!nocion && !impacto)) {
        continue;
      }

      const category = this.normalizeCategory(rawCategory);
      const content = `Símbolo LEL: ${rawName}\nCategoría: ${category}\nNoción: ${nocion}\nImpacto: ${impacto}`;

      chunks.push({
        content,
        metadata: {
          sourceType: 'LEL',
          projectName,
          symbolNumber,
          symbolName: rawName,
          category,
          nocion,
          impacto,
        },
      });
      symbolNumber++;
    }

    return chunks;
  }

  private parseTabularTranscriptLelBlocks(
    projectName: string,
    text: string,
  ): RagChunk<LelChunkMetadata>[] {
    const chunks: RagChunk<LelChunkMetadata>[] = [];
    const regex =
      /S[ií]mbolo\s*N[º°ro\.]*\s*:?\s*(\d+)?[\s\t]+(?:Tipo|Categor[ií]a)\s*:?\s*([^\n\r]+)[\s\S]*?Nombre(?:\/s)?\s*[:\t]?\s*([^\n\r]+)[\s\S]*?Noci[oó]n\s*[:\t]?\s*([\s\S]*?)(?=Impacto\s*[:\t]?)Impacto\s*[:\t]?\s*([\s\S]*?)(?=(?:S[ií]mbolo\s*N[º°ro\.]*\s*:?|-- \d+ of \d+ --|$))/gi;

    let match: RegExpExecArray | null;
    let autoNumber = 1;

    while ((match = regex.exec(text)) !== null) {
      const parsedNum = match[1] ? parseInt(match[1], 10) : autoNumber;
      const symbolNumber = Number.isNaN(parsedNum) ? autoNumber : parsedNum;
      const rawCategory = match[2].trim();
      const rawName = match[3].replace(/\*\*/g, '').trim();
      const nocion = this.cleanMultilineField(match[4]);
      const impacto = this.cleanMultilineField(match[5]);

      if (!rawName || (!nocion && !impacto)) {
        continue;
      }

      const category = this.normalizeCategory(rawCategory);
      const content = `Símbolo LEL: ${rawName}\nCategoría: ${category}\nNoción: ${nocion}\nImpacto: ${impacto}`;

      chunks.push({
        content,
        metadata: {
          sourceType: 'LEL',
          projectName,
          symbolNumber,
          symbolName: rawName,
          category,
          nocion,
          impacto,
        },
      });
      autoNumber++;
    }

    return chunks;
  }

  private normalizeCategory(cat: string): string {
    const clean = cat.replace(/[\[\]\(\)]/g, '').trim().toUpperCase();
    if (clean === 'O' || clean.includes('OBJETO')) return 'Objeto';
    if (clean === 'S' || clean.includes('SUJETO')) return 'Sujeto';
    if (clean === 'V' || clean.includes('VERBO')) return 'Verbo';
    if (clean === 'E' || clean.includes('ESTADO')) return 'Estado';
    return cat.trim() || 'No especificado';
  }

  private cleanMultilineField(raw: string): string {
    return raw
      .split('\n')
      .map((line) =>
        line
          .replace(/^[\s●*•\-]+/, '')
          .replace(/\*\*/g, '')
          .trim(),
      )
      .filter((line) => line.length > 0 && !/^---+$/.test(line))
      .join(' ');
  }

  private cleanHorizontalRules(raw: string): string {
    return raw
      .replace(/(?:^|\n)\s*---+\s*(?=\n|$)/g, '\n')
      .trim();
  }

  private extractH1(body: string): string | undefined {
    const match = body.match(/^\s*#\s+([^\n]+)$/m);
    return match ? match[1].trim() : undefined;
  }

  private extractFrontmatter(markdown: string): {
    frontmatter: ParsedFrontmatter;
    body: string;
  } {
    const defaultFrontmatter: ParsedFrontmatter = {
      checklistCodes: [],
      keywords: [],
      targetComponents: [],
      scenarioTypes: [],
    };

    const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) {
      return { frontmatter: defaultFrontmatter, body: markdown };
    }

    const yamlBlock = fmMatch[1];
    const body = fmMatch[2];
    const rawMap: Record<string, string | string[]> = {};

    const lines = yamlBlock.split('\n');
    let currentListKey: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('- ') && currentListKey) {
        const item = this.unquote(trimmed.slice(2).trim());
        const arr = rawMap[currentListKey];
        if (Array.isArray(arr)) {
          arr.push(item);
        }
        continue;
      }

      const kvMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const rawVal = kvMatch[2].trim();

        if (!rawVal) {
          currentListKey = key;
          rawMap[key] = [];
        } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
          currentListKey = null;
          const inner = rawVal.slice(1, -1).trim();
          rawMap[key] = inner
            ? inner
                .split(',')
                .map((part) => this.unquote(part.trim()))
                .filter((part) => part.length > 0)
            : [];
        } else {
          currentListKey = null;
          rawMap[key] = this.unquote(rawVal);
        }
      }
    }

    const toStringArray = (val: string | string[] | undefined): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return val
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    };

    return {
      frontmatter: {
        id: typeof rawMap.id === 'string' ? rawMap.id : undefined,
        title: typeof rawMap.title === 'string' ? rawMap.title : undefined,
        category:
          typeof rawMap.category === 'string' ? rawMap.category : undefined,
        checklistCodes: toStringArray(
          rawMap.checklistCodes ?? rawMap.checklist_codes,
        ),
        keywords: toStringArray(rawMap.keywords),
        targetComponents: toStringArray(
          rawMap.targetComponents ?? rawMap.target_components,
        ),
        scenarioTypes: toStringArray(
          rawMap.scenarioTypes ?? rawMap.scenario_types,
        ),
      },
      body,
    };
  }

  private unquote(val: string): string {
    return val.replace(/^["']|["']$/g, '').trim();
  }
}

