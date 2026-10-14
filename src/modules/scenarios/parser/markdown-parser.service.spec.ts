import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MarkdownParserService } from './markdown-parser.service';

describe('MarkdownParserService', () => {
  let service: MarkdownParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarkdownParserService],
    }).compile();

    service = module.get<MarkdownParserService>(MarkdownParserService);
  });

  describe('Plantilla Markdown Canónica (COBRAR EL TRÁMITE)', () => {
    const canonicalMarkdown = `
# COBRAR EL TRÁMITE
**Tipo:** Actual

**Objetivo:** El cajero cobra el trámite al solicitante

**Contexto:**
- **Ubicación Geográfica:** Ventanilla 3 de la Municipalidad
- **Ubicación Temporal:** Horas de atención (9:00-16:00)
- **Precondición:** El solicitante completó el formulario y tiene documentación válida

**Recursos:** Formulario, Comprobante, Listado de Precios, Sistema de Cobros

**Actores:** Cajero, Solicitante

**Episodios:**
1. El solicitante presenta el formulario completado al cajero
2. Si el monto está en el listado de precios entonces el cajero verifica el monto en el sistema
3. El cajero debería entregar el comprobante [← ERROR 1: Verbo débil "debería"]
4. # El cajero registra el pago en el sistema
   El cajero entrega el comprobante [← ERROR 2: Falta cierre #]
5. GENERAR RECIBO [← REFERENCIA SUB-ESCENARIO]

**Excepciones:**
- El solicitante no tiene documentación: El cajero solicita que valide datos
- Monto no coincide: RECHAZAR PAGO
`;

    it('debe parsear correctamente todos los campos estructurales', () => {
      const parsed = service.parse(canonicalMarkdown);

      expect(parsed.title).toBe('COBRAR EL TRÁMITE');
      expect(parsed.type).toBe('ACTUAL');
      expect(parsed.rawRole).toBe('PARTICULAR');
      expect(parsed.objective).toBe('El cajero cobra el trámite al solicitante');
      expect(parsed.contextGeo).toBe('Ventanilla 3 de la Municipalidad');
      expect(parsed.contextTime).toBe('Horas de atención (9:00-16:00)');
      expect(parsed.contextPrecond).toContain('El solicitante completó el formulario');
      expect(parsed.actors).toEqual(['Cajero', 'Solicitante']);
      expect(parsed.resources).toEqual([
        'Formulario',
        'Comprobante',
        'Listado de Precios',
        'Sistema de Cobros',
      ]);
      expect(parsed.episodes).toHaveLength(5);
      expect(parsed.episodes[0].number).toBe(1);
      expect(parsed.episodes[0].type).toBe('SIMPLE');
      expect(parsed.episodes[1].number).toBe(2);
      expect(parsed.episodes[1].type).toBe('CONDITIONAL');
      expect(parsed.episodes[2].number).toBe(3);
      expect(parsed.episodes[2].text).toBe('El cajero debería entregar el comprobante');
      expect(parsed.episodes[3].number).toBe(4);
      expect(parsed.episodes[3].type).toBe('NON_SEQUENTIAL');
      expect(parsed.episodes[3].rawText).toContain('# El cajero registra el pago en el sistema');
      expect(parsed.episodes[4].number).toBe(5);
      expect(parsed.episodes[4].type).toBe('SUB_SCENARIO');
      expect(parsed.episodes[4].text).toBe('GENERAR RECIBO');

      expect(parsed.exceptions).toHaveLength(2);
      expect(parsed.exceptions[0].causa).toBe('El solicitante no tiene documentación');
      expect(parsed.exceptions[0].tratamiento).toBe('El cajero solicita que valide datos');
      expect(parsed.exceptions[1].causa).toBe('Monto no coincide');
      expect(parsed.exceptions[1].tratamiento).toBe('RECHAZAR PAGO');
    });
  });

  describe('Formato Oficial del Caso de Estudio (Juzgado / Plantilla Cátedra)', () => {
    const juzgadoMarkdown = `
Escenario Nº: 1
Título: CARGAR DOCUMENTACIÓN
Objetivo: Subir Documentos al sistema de gestión.
Contexto:
Ubicación Geográfica: (en blanco)
Ubicación Temporal: --
Precondiciones:
● El usuario se debe encontrar logueado.
● Los Documentos deben estar en los formatos admitidos.
● Debe existir el Proceso Judicial al que se le quieren cargar los Documentos.
Recursos:
● Documento
Actores:
● Escribiente
● Sistema
Episodios:
1. LISTAR DOCUMENTOS
2. El Sistema solicita la ruta de los Documentos a cargar.
3. El Escribiente ingresa la ruta de cada Documento que desea cargar al sistema. Restricción: “Los Documentos no deben de superar el peso de 100mb”.
4. El Escribiente selecciona la opción de “Aceptar”.
5. El Sistema genera un ID único por cada Documento subido.
6. El Sistema completa la subida de Documentos vinculados al Proceso Judicial.
7. El sistema avisa la carga exitosa de Documentos.
Excepciones:
Causa: El tipo de archivo a subir está en un formato que no admite el Sistema.
Solución: El Sistema dará aviso que el tipo de archivo que intenta subir no es un formato admitido, mostrando los formatos que sí admite el sistema.
`;

    it('debe parsear viñetas ●, limpiar valores vacíos y extraer restricciones', () => {
      const parsed = service.parse(juzgadoMarkdown);

      expect(parsed.scenarioNumber).toBe(1);
      expect(parsed.title).toBe('CARGAR DOCUMENTACIÓN');
      expect(parsed.objective).toBe('Subir Documentos al sistema de gestión.');
      expect(parsed.contextGeo).toBeNull();
      expect(parsed.contextTime).toBeNull();
      expect(parsed.contextPrecond).toContain('El usuario se debe encontrar logueado.');
      expect(parsed.contextPrecond).not.toContain('●');
      expect(parsed.resources).toEqual(['Documento']);
      expect(parsed.actors).toEqual(['Escribiente', 'Sistema']);
      expect(parsed.episodes).toHaveLength(7);

      // Sub-escenario en mayúsculas
      expect(parsed.episodes[0].type).toBe('SUB_SCENARIO');
      expect(parsed.episodes[0].text).toBe('LISTAR DOCUMENTOS');

      // Restricción extraída limpiamente
      expect(parsed.episodes[2].restriction).toBe('Los Documentos no deben de superar el peso de 100mb');
      expect(parsed.episodes[2].text).toBe(
        'El Escribiente ingresa la ruta de cada Documento que desea cargar al sistema.',
      );

      // Excepción formato Causa / Solución
      expect(parsed.exceptions).toHaveLength(1);
      expect(parsed.exceptions[0].causa).toBe(
        'El tipo de archivo a subir está en un formato que no admite el Sistema.',
      );
      expect(parsed.exceptions[0].tratamiento).toBe(
        'El Sistema dará aviso que el tipo de archivo que intenta subir no es un formato admitido, mostrando los formatos que sí admite el sistema.',
      );
    });
  });

  describe('Manejo de Errores y Validaciones de Entrada', () => {
    it('debe lanzar BadRequestException si el markdown está vacío', () => {
      expect(() => service.parse('')).toThrow(BadRequestException);
      expect(() => service.parse('   \n  \t  ')).toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el texto no tiene estructura de escenario', () => {
      const randomText = 'Este es un texto cualquiera sin formato ni secciones.';
      expect(() => service.parse(randomText)).toThrow(BadRequestException);
    });
  });

  describe('Clasificación de Tipos de Episodio', () => {
    it('debe clasificar correctamente condicionales, optativos, no secuenciales y simples', () => {
      const markdown = `
# PROBAR TIPOS
**Objetivo:** Probar clasificación de episodios
**Contexto:**
- **Ubicación Geográfica:** Laboratorio
**Recursos:** Consola
**Actores:** Tester
**Episodios:**
1. El tester inicia la prueba
2. Si la conexión está activa entonces el sistema responde OK
3. [El tester solicita logs detallados]
4. # El sistema envía email de aviso
   El sistema escribe en disco #
5. LIMPIAR TEMPORALES
`;
      const parsed = service.parse(markdown);
      expect(parsed.episodes[0].type).toBe('SIMPLE');
      expect(parsed.episodes[1].type).toBe('CONDITIONAL');
      expect(parsed.episodes[2].type).toBe('OPTIONAL');
      expect(parsed.episodes[3].type).toBe('NON_SEQUENTIAL');
      expect(parsed.episodes[4].type).toBe('SUB_SCENARIO');
    });
  });

  describe('Casos Borde de Formato (Prefijos de Título y Separadores de Excepción)', () => {
    it('debe limpiar el prefijo "TÍTULO:" o "Título:" en encabezados H1', () => {
      const markdown = `
# TÍTULO: COBRAR EL TRÁMITE
**Objetivo:** Cobrar trámite
**Contexto:**
- **Ubicación Geográfica:** Ventanilla
**Recursos:** TPV
**Actores:** Cajero
**Episodios:**
1. El Cajero solicita el monto
2. El Cajero cobra el monto
`;
      const parsed = service.parse(markdown);
      expect(parsed.title).toBe('COBRAR EL TRÁMITE');
    });

    it('debe limpiar completamente "Solución / Tratamiento:" sin dejar residuos en causa', () => {
      const markdown = `
# REGISTRAR PAGO
**Objetivo:** Cobrar
**Contexto:**
- **Ubicación Geográfica:** Ventanilla
**Recursos:** TPV
**Actores:** Cajero
**Episodios:**
1. El Cajero cobra
2. El Cajero entrega ticket
**Excepciones:**
Causa: Tarjeta sin fondos suficientes.
Solución / Tratamiento: El Cajero solicita otro medio de pago al cliente.
`;
      const parsed = service.parse(markdown);
      expect(parsed.exceptions).toHaveLength(1);
      expect(parsed.exceptions[0].causa).toBe('Tarjeta sin fondos suficientes.');
      expect(parsed.exceptions[0].causa).not.toContain('Solución /');
      expect(parsed.exceptions[0].tratamiento).toBe(
        'El Cajero solicita otro medio de pago al cliente.',
      );
    });
  });
});

