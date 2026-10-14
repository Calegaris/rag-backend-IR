import { Test, TestingModule } from '@nestjs/testing';
import { DeterministicValidatorService } from './deterministic-validator.service';
import { MarkdownParserService } from '../parser/markdown-parser.service';

describe('DeterministicValidatorService', () => {
  let validator: DeterministicValidatorService;
  let parser: MarkdownParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeterministicValidatorService, MarkdownParserService],
    }).compile();

    validator = module.get<DeterministicValidatorService>(DeterministicValidatorService);
    parser = module.get<MarkdownParserService>(MarkdownParserService);
  });

  describe('Caso 1: COBRAR EL TRÁMITE (Errores Sintácticos y Verbo Débil)', () => {
    const markdown = `
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
3. El cajero debería entregar el comprobante
4. # El cajero registra el pago en el sistema
   El cajero entrega el comprobante
5. GENERAR RECIBO

**Excepciones:**
- El solicitante no tiene documentación: El cajero solicita que valide datos
- Monto no coincide: RECHAZAR PAGO
`;

    it('debe detectar bloque #...# desbalanceado y verbo débil "debería", resultando en isValid = false', () => {
      const parsed = parser.parse(markdown);
      const report = validator.validate(parsed);

      expect(report.isValid).toBe(false);

      // Verbo débil "debería" en episodio 3
      const weakVerbIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-16-VERBOS-DEBILES' && i.line === 3,
      );
      expect(weakVerbIssue).toBeDefined();
      expect(weakVerbIssue?.severity).toBe('ERROR');
      expect(weakVerbIssue?.message).toContain('debería');

      // Bloque no secuencial desbalanceado en episodio 4
      const nonSeqIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-19-BNF-NO-SECUENCIAL' && i.line === 4,
      );
      expect(nonSeqIssue).toBeDefined();
      expect(nonSeqIssue?.severity).toBe('ERROR');
      expect(nonSeqIssue?.message).toContain('no está balanceado');
    });
  });

  describe('Caso 2: REGISTRAR USUARIO (Escenario 100% Válido)', () => {
    const markdown = `
# REGISTRAR USUARIO
**Tipo:** Actual

**Objetivo:** Registrar un nuevo usuario en la plataforma

**Contexto:**
- **Ubicación Geográfica:** Portal Web
- **Ubicación Temporal:** En cualquier momento
- **Precondición:** El usuario cuenta con correo electrónico válido

**Recursos:** Formulario de Registro, Base de Datos

**Actores:** Usuario, Sistema

**Episodios:**
1. El Usuario ingresa sus datos personales en el Formulario de Registro
2. El Usuario envía el formulario al Sistema
3. Si los datos son válidos entonces el Sistema almacena el nuevo registro
4. [El Usuario solicita suscripción al boletín informativo]
5. El Sistema envía correo de confirmación al Usuario

**Excepciones:**
- Causa: Correo ya registrado. Tratamiento: El Sistema muestra mensaje de error al Usuario
`;

    it('debe validar exitosamente sin errores determinísticos (isValid = true)', () => {
      const parsed = parser.parse(markdown);
      const report = validator.validate(parsed);

      expect(report.isValid).toBe(true);
      expect(report.summary.syntaxErrorsCount).toBe(0);
      expect(report.summary.structuralErrorsCount).toBe(0);
      const errors = report.validations.deterministic.filter((i) => i.severity === 'ERROR');
      expect(errors).toHaveLength(0);
    });
  });

  describe('Caso 3: GENERAR REPORTE (Escenario Integrador Inválido)', () => {
    const markdown = `
# GENERAR REPORTE
**Tipo:** Integrador

**Objetivo:** Generar el reporte integral del período

**Contexto:**
- **Precondición:** Período contable cerrado

**Recursos:** Servidor, Impresora
**Actores:** Administrador

**Episodios:**
1. RECOPILAR DATOS
2. PROCESAR ESTADISTICAS
3. EMITIR BALANCE
`;

    it('debe fallar con error si un Integrador tiene Actores o Recursos no vacíos', () => {
      const parsed = parser.parse(markdown);
      const report = validator.validate(parsed);

      expect(report.isValid).toBe(false);

      const actorsIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-INT-VACIOS' && i.field === 'Actores',
      );
      expect(actorsIssue).toBeDefined();
      expect(actorsIssue?.severity).toBe('ERROR');

      const resourcesIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-INT-VACIOS' && i.field === 'Recursos',
      );
      expect(resourcesIssue).toBeDefined();
      expect(resourcesIssue?.severity).toBe('ERROR');
    });

    it('debe fallar si un episodio de Integrador no es título en MAYÚSCULAS', () => {
      const markdownMinusculas = `
# GENERAR REPORTE
**Tipo:** Integrador
**Objetivo:** Consolidar estados
**Contexto:**
- **Precondición:** Cierre anual listo
**Recursos:** --
**Actores:** --
**Episodios:**
1. RECOPILAR DATOS
2. procesar estadísticas de ventas
`;
      const parsed = parser.parse(markdownMinusculas);
      const report = validator.validate(parsed);

      expect(report.isValid).toBe(false);
      const epIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-INT-SUBESCENARIOS' && i.line === 2,
      );
      expect(epIssue).toBeDefined();
      expect(epIssue?.severity).toBe('ERROR');
    });
  });

  describe('Caso 4: BUSCAR DISPONIBILIDAD (Contexto Completamente Vacío)', () => {
    const markdown = `
# BUSCAR DISPONIBILIDAD
**Tipo:** Actual
**Objetivo:** Consultar cupos disponibles en el sistema
**Contexto:**
- **Ubicación Geográfica:** --
- **Ubicación Temporal:** (en blanco)
- **Precondición:** --
**Recursos:** Terminal
**Actores:** Cliente
**Episodios:**
1. El Cliente consulta cupos en la Terminal
2. La Terminal muestra los horarios disponibles al Cliente
`;

    it('debe detectar que todos los campos de contexto están vacíos', () => {
      const parsed = parser.parse(markdown);
      const report = validator.validate(parsed);

      expect(report.isValid).toBe(false);
      const contextIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-02-NULOS' && i.field === 'Contexto',
      );
      expect(contextIssue).toBeDefined();
      expect(contextIssue?.severity).toBe('ERROR');
    });
  });

  describe('Caso 5: Escenario con < 2 episodios, título sin infinitivo y excepción rota', () => {
    const markdown = `
# FACTURACION DE PRODUCTOS
**Tipo:** Actual
**Objetivo:** El sistema factura la compra
**Contexto:**
- **Precondición:** Carrito con artículos
**Recursos:** TPV
**Actores:** Cajero
**Episodios:**
1. El Cajero cobra el total en el TPV
**Excepciones:**
- Causa: Corte de luz
`;

    it('debe marcar isValid = false por < 2 episodios, excepción sin tratamiento y advertir por título no infinitivo', () => {
      const parsed = parser.parse(markdown);
      const report = validator.validate(parsed);

      expect(report.isValid).toBe(false);

      // Min episodios
      const minEpIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-03-MIN-EPISODIOS',
      );
      expect(minEpIssue).toBeDefined();
      expect(minEpIssue?.severity).toBe('ERROR');

      // Título no infinitivo ("FACTURACION")
      const titleIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-04-TITULO-INFINITIVO',
      );
      expect(titleIssue).toBeDefined();
      expect(titleIssue?.severity).toBe('WARNING');

      // Excepción sin tratamiento
      const excIssue = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-25-EXCEPCION-ESTRUCTURA',
      );
      expect(excIssue).toBeDefined();
      expect(excIssue?.severity).toBe('ERROR');
    });
  });

  describe('Caso 6: Caso Real Juzgado (Restricción con "deben" no dispara falso positivo)', () => {
    const juzgadoMarkdown = `
Escenario Nº: 1
Título: CARGAR DOCUMENTACIÓN
Objetivo: Subir Documentos al sistema de gestión.
Contexto:
Precondiciones:
● El usuario se debe encontrar logueado.
● Los Documentos deben estar en los formatos admitidos.
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
Solución: El Sistema dará aviso que el tipo de archivo que intenta subir no es un formato admitido.
`;

    it('no debe disparar CHK-16-VERBOS-DEBILES en el episodio 3 por la palabra "deben" dentro de la restricción', () => {
      const parsed = parser.parse(juzgadoMarkdown);
      const report = validator.validate(parsed);

      // El episodio 3 tiene "deben" dentro de la restricción, no en el texto del episodio
      const ep3WeakVerb = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-16-VERBOS-DEBILES' && i.line === 3,
      );
      expect(ep3WeakVerb).toBeUndefined();

      // Ningún otro error en episodio 3
      const ep3Errors = report.validations.deterministic.filter(
        (i) => i.line === 3 && i.severity === 'ERROR',
      );
      expect(ep3Errors).toHaveLength(0);

      // El escenario completo es válido
      expect(report.isValid).toBe(true);
    });
  });

  describe('Caso 7: Chequeo de Actores Declarados pero No Mencionados', () => {
    const markdown = `
# GESTIONAR ARCHIVO
**Objetivo:** Archivar expediente
**Contexto:**
- **Precondición:** Caso resuelto
**Recursos:** Armario
**Actores:** Archivista, Supervisor
**Episodios:**
1. El Archivista clasifica el expediente en el Armario
2. El Archivista guarda la carpeta en el Armario
`;

    it('debe emitir un WARNING para el actor "Supervisor" por no estar mencionado', () => {
      const parsed = parser.parse(markdown);
      const report = validator.validate(parsed);

      const actorWarning = report.validations.deterministic.find(
        (i) => i.ruleId === 'CHK-ACTORES-MENCION' && i.message.includes('Supervisor'),
      );
      expect(actorWarning).toBeDefined();
      expect(actorWarning?.severity).toBe('WARNING');
    });
  });
});
