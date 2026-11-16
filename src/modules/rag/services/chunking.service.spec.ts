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

    it('should parse labeled Símbolo blocks (Radiomano format with bold labels)', () => {
      const radiomanoLel = `
**LÉXICO EXTENDIDO DEL LENGUAJE**

**Proyecto:** Optimización del sistema de Radiomano

**DESCRIPCIÓN DE SÍMBOLOS**

**Símbolo N°:** 1  
**Nombre:** ADMINISTRAR EL PROGRAMA  
**Tipo:** Verbo  
**Noción:** 

1. Es realizada por el productor.  
2. Acción por la cual el productor organiza la agenda, las entrevistas, coordina el aire, etc.  
3. Es realizada en las oficinas de la radio.

**Impacto:**

1. Permite que el programa salga al aire correctamente.  
2. Da lugar a una programación organizada.

**Símbolo N°:** 2  
**Nombre:** AGENDA  
**Tipo:** Objeto  
**Noción:**

1. Es el conjunto de temáticas, entrevistas y asuntos que va a tener el programa.  
2. Es uno de los resultados de la administración del programa.

**Impacto:**

1. Es creado por el productor.  
2. Es en lo que se basa la programación.

**Símbolo N°:** 3  
**Nombre:** AL AIRE  
**Tipo:** Estado  
**Noción:**

1. Estado del programa.

**Impacto:**

1. Se transmite.
`;

      const chunks = service.chunkLelMarkdown(
        'Optimización del sistema de Radiomano',
        radiomanoLel,
      );

      expect(chunks).toHaveLength(3);
      expect(chunks[0].metadata.symbolName).toBe('ADMINISTRAR EL PROGRAMA');
      expect(chunks[0].metadata.category).toBe('Verbo');
      expect(chunks[0].metadata.nocion).toContain(
        'Es realizada por el productor.',
      );
      expect(chunks[1].metadata.symbolName).toBe('AGENDA');
      expect(chunks[1].metadata.category).toBe('Objeto');
      expect(chunks[2].metadata.symbolName).toBe('AL AIRE');
      expect(chunks[2].metadata.category).toBe('Estado');
    });

    it('should parse freeform descriptive LEL blocks with (O/S/V/E) and Noción/Impacto', () => {
      const freeformLel = `
Agenda / Agenda de reuniones (O)

Noción:
Es el elemento donde se registran los requerimientos de las reuniones.

Impacto:
Se registra el objetivo de la reunión y los convocados.

Convocante (S)

Noción:
Persona que convoca a la reunión.

Impacto:
Establece la fecha y envía la notificación.
`;

      const chunks = service.chunkLelMarkdown(
        'Sistema de Gestión de Reuniones',
        freeformLel,
      );

      expect(chunks).toHaveLength(2);
      expect(chunks[0].metadata.symbolName).toBe(
        'Agenda / Agenda de reuniones',
      );
      expect(chunks[0].metadata.category).toBe('Objeto');
      expect(chunks[0].metadata.nocion).toBe(
        'Es el elemento donde se registran los requerimientos de las reuniones.',
      );
      expect(chunks[1].metadata.symbolName).toBe('Convocante');
      expect(chunks[1].metadata.category).toBe('Sujeto');
    });

    it('should parse tabular transcript LEL format', () => {
      const transcriptLel = `
Símbolo Nº:1 	Tipo: Sujeto
Nombre/s 	Administrativo
Noción 	● Es la persona que trabaja para la empresa
Impacto 	● Asigna las visitas
`;

      const chunks = service.chunkLelMarkdown('Mystery Shopper', transcriptLel);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].metadata.symbolName).toBe('Administrativo');
      expect(chunks[0].metadata.category).toBe('Sujeto');
      expect(chunks[0].metadata.nocion).toBe(
        'Es la persona que trabaja para la empresa',
      );
    });
  });
});

