import * as fs from 'fs';
import * as path from 'path';
import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  describe('chunkMarcoTeoricoFile', () => {
    it('should parse YAML frontmatter and split markdown by ## sections with contextual headers', () => {
      const sampleMarkdown = `---
id: "01-reglas-titulo-y-objetivo"
title: "Reglas de Título y Objetivo en Escenarios"
category: "Título y Objetivo"
checklist_codes: ["CHK-04-TITULO-INFINITIVO", "CHK-05-OBJETIVO"]
keywords: ["infinitivo", "objetivo"]
targetComponents: ["Título", "Objetivo"]
scenarioTypes: ["ACTUAL", "FUTURO"]
---

# Reglas de Título y Objetivo en Escenarios

## 1. Sintaxis del Título
El título debe iniciar con un verbo en infinitivo y reflejar el punto de vista del negocio.

---

## 2. Redacción del Objetivo
El objetivo debe expresarse en una sola oración afirmativa con un único verbo principal.
`;

      const chunks = service.chunkMarcoTeoricoFile(
        '01-reglas-titulo-y-objetivo.md',
        sampleMarkdown,
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toContain(
        '[Marco Teórico: Reglas de Título y Objetivo en Escenarios | Categoría: Título y Objetivo | Sección: 1. Sintaxis del Título]',
      );
      expect(chunks[0].content).toContain(
        'El título debe iniciar con un verbo en infinitivo',
      );
      expect(chunks[0].metadata).toEqual({
        sourceType: 'MARCO_TEORICO',
        docId: '01-reglas-titulo-y-objetivo',
        filename: '01-reglas-titulo-y-objetivo.md',
        title: 'Reglas de Título y Objetivo en Escenarios',
        category: 'Título y Objetivo',
        sectionHeading: '1. Sintaxis del Título',
        checklistCodes: ['CHK-04-TITULO-INFINITIVO', 'CHK-05-OBJETIVO'],
        keywords: ['infinitivo', 'objetivo'],
        targetComponents: ['Título', 'Objetivo'],
        scenarioTypes: ['ACTUAL', 'FUTURO'],
      });
      expect(chunks[1].metadata.sectionHeading).toBe(
        '2. Redacción del Objetivo',
      );
    });

    it('should subdivide ## sections exceeding 2500 characters by ### subsections', () => {
      const longParagraphA = 'A'.repeat(1500);
      const longParagraphB = 'B'.repeat(1500);
      const largeMarkdown = `---
id: "04-reglas-episodios"
title: "Reglas de Episodios"
targetComponents: ["Episodios"]
---

# Reglas de Episodios

## 1. Reglas Extensas
### 1.1 Subsección A
${longParagraphA}

### 1.2 Subsección B
${longParagraphB}
`;

      const chunks = service.chunkMarcoTeoricoFile(
        '04-reglas-episodios.md',
        largeMarkdown,
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].metadata.sectionHeading).toBe(
        '1. Reglas Extensas - 1.1 Subsección A',
      );
      expect(chunks[1].metadata.sectionHeading).toBe(
        '1. Reglas Extensas - 1.2 Subsección B',
      );
      expect(chunks[0].metadata.category).toBe('Episodios');
    });
  });

  describe('chunkLelMarkdown', () => {
    it('should extract all 17 atomic LEL symbol chunks from real 02-lel-normalizado.md', () => {
      const candidates = [
        path.resolve(
          process.cwd(),
          '..',
          'luis-angel-calegari',
          'casos-estudio',
          'Caso Gestion Documentos Juzgado',
          'texto-anonimizado',
          '02-lel-normalizado.md',
        ),
        path.resolve(
          process.cwd(),
          'luis-angel-calegari',
          'casos-estudio',
          'Caso Gestion Documentos Juzgado',
          'texto-anonimizado',
          '02-lel-normalizado.md',
        ),
      ];
      const lelPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
      const rawLel = fs.readFileSync(lelPath, 'utf-8');

      const chunks = service.chunkLelMarkdown(
        'Gestión de Documentos en Juzgado',
        rawLel,
      );

      expect(chunks).toHaveLength(17);

      expect(chunks[0].metadata.symbolNumber).toBe(1);
      expect(chunks[0].metadata.symbolName).toBe('Acorde a derecho');
      expect(chunks[0].metadata.category).toBe('Estado');
      expect(chunks[0].content).toContain('Símbolo LEL: Acorde a derecho');
      expect(chunks[0].content).toContain('Categoría: Estado');

      const escribiente = chunks.find(
        (c) => c.metadata.symbolName === 'Escribiente',
      );
      expect(escribiente).toBeDefined();
      expect(escribiente?.metadata.category).toBe('Sujeto');
      expect(escribiente?.metadata.impacto).toContain(
        'Carga y descarga documentos en el Sistema EJE',
      );

      expect(chunks[16].metadata.symbolNumber).toBe(17);
      expect(chunks[16].metadata.symbolName).toBe('Juez');
      expect(chunks[16].metadata.category).toBe('Sujeto');
    });

    it('should parse compact bullet-list LEL format', () => {
      const compactLel = `
- **Cajero** (Sujeto): Empleado municipal encargado de cobros. Impacto: Registra pagos y emite recibos.
- **Formulario** (Objeto): Planilla con datos del trámite. Impacto: Es presentado por el solicitante.
`;

      const chunks = service.chunkLelMarkdown('Municipalidad', compactLel);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].metadata).toEqual({
        sourceType: 'LEL',
        projectName: 'Municipalidad',
        symbolNumber: 1,
        symbolName: 'Cajero',
        category: 'Sujeto',
        nocion: 'Empleado municipal encargado de cobros',
        impacto: 'Registra pagos y emite recibos.',
      });
      expect(chunks[1].metadata.symbolName).toBe('Formulario');
      expect(chunks[1].metadata.category).toBe('Objeto');
    });
  });
});

