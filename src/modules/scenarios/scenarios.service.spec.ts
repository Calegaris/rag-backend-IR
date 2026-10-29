import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMFactory } from '../llm/llm.factory';
import { ILLMProvider } from '../llm/llm.interface';
import { MarkdownParserService } from './parser/markdown-parser.service';
import { ScenariosService } from './scenarios.service';
import { SemanticValidatorService } from './services/semantic-validator.service';
import { DeterministicValidatorService } from './validator/deterministic-validator.service';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let mockLLMProvider: jest.Mocked<ILLMProvider>;
  let mockLLMFactory: Partial<LLMFactory>;
  let mockConfigService: Partial<ConfigService>;
  let mockSemanticValidator: {
    validateSemantics: jest.Mock;
  };
  let mockPrismaService: {
    validationLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const validScenarioMarkdown = `ESCENARIOS

Proyecto: Caso Gestión Documentos Juzgado

DESCRIPCIÓN DE ESCENARIOS

Escenario Nro.: 1
Título: CARGAR DOCUMENTACIÓN
Tipo de escenario: Particular
Objetivo: Incorporar Documentos al expediente judicial.
Contexto
Ubicación Geográfica: Sede Judicial
Ubicación Temporal: Días hábiles
Precondiciones:
● El Escribiente está registrado en el sistema.
Recursos: Documento
Actores: Escribiente, Sistema
Episodios:
1. El Escribiente selecciona el Documento a incorporar.
2. El Sistema almacena el Documento en el repositorio.
Excepciones:
Causa: El formato del Documento es inválido. Tratamiento: El Sistema informa los formatos permitidos.`;

  beforeEach(async () => {
    mockLLMProvider = {
      providerName: 'gemini',
      generateStructured: jest.fn(),
    };

    mockLLMFactory = {
      getProvider: jest.fn().mockReturnValue(mockLLMProvider),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'llm.model') return 'gemini-3.6-flash';
        return null;
      }),
    };

    mockSemanticValidator = {
      validateSemantics: jest.fn().mockResolvedValue({
        issues: [],
        ragContextUsed: {
          marcoTeoricoChunks: 6,
          lelSymbols: ['Documento', 'Escribiente'],
        },
        llmProvider: 'gemini',
        llmModel: 'gemini-3.6-flash',
      }),
    };

    mockPrismaService = {
      validationLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScenariosService,
        MarkdownParserService,
        DeterministicValidatorService,
        {
          provide: SemanticValidatorService,
          useValue: mockSemanticValidator,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: LLMFactory, useValue: mockLLMFactory },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    it('debe ejecutar validación determinística + semántica por defecto, actualizar isValid si hay ERROR semántico y persistir ValidationLog', async () => {
      mockSemanticValidator.validateSemantics.mockResolvedValueOnce({
        issues: [
          {
            code: 'SEM_LEL_CONSISTENCY',
            severity: 'ERROR',
            component: 'RECURSOS',
            message: 'Término ajeno al LEL.',
            suggestion: 'Usar símbolo Documento.',
            ragReference: 'Símbolo LEL: Documento',
          },
        ],
        ragContextUsed: {
          marcoTeoricoChunks: 6,
          lelSymbols: ['Documento', 'Escribiente'],
        },
        llmProvider: 'gemini',
        llmModel: 'gemini-3.6-flash',
      });

      const report = await service.validate({
        rawMarkdown: validScenarioMarkdown,
        projectName: 'Gestión de Documentos en Juzgado',
      });

      expect(mockSemanticValidator.validateSemantics).toHaveBeenCalledTimes(1);
      expect(report.validations.semantic).toHaveLength(1);
      expect(report.summary.semanticIssuesCount).toBe(1);
      expect(report.ragContextUsed).toEqual({
        marcoTeoricoChunks: 6,
        lelSymbols: ['Documento', 'Escribiente'],
      });
      expect(report.isValid).toBe(false);
      expect(mockPrismaService.validationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scenarioTitle: 'CARGAR DOCUMENTACIÓN',
            isValid: false,
            llmProvider: 'gemini',
          }),
        }),
      );
    });

    it('debe omitir validación semántica cuando enableSemantic es false', async () => {
      const report = await service.validate({
        rawMarkdown: validScenarioMarkdown,
        enableSemantic: false,
      });

      expect(mockSemanticValidator.validateSemantics).not.toHaveBeenCalled();
      expect(report.validations.semantic).toEqual([]);
      expect(report.summary.semanticIssuesCount).toBe(0);
      expect(mockPrismaService.validationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            llmProvider: null,
          }),
        }),
      );
    });

    it('no debe fallar si la persistencia en ValidationLog lanza una excepción', async () => {
      mockPrismaService.validationLog.create.mockRejectedValueOnce(
        new Error('Database offline'),
      );

      const report = await service.validate({
        rawMarkdown: validScenarioMarkdown,
      });

      expect(report).toBeDefined();
      expect(report.scenarioTitle).toBe('CARGAR DOCUMENTACIÓN');
    });
  });

  describe('getValidations', () => {
    it('debe retornar el historial de validaciones ordenado por createdAt desc', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          scenarioTitle: 'CARGAR DOCUMENTACIÓN',
          isValid: true,
          createdAt: new Date(),
        },
      ];
      mockPrismaService.validationLog.findMany.mockResolvedValueOnce(mockLogs);

      const result = await service.getValidations(15);

      expect(mockPrismaService.validationLog.findMany).toHaveBeenCalledWith({
        take: 15,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockLogs);
    });
  });

  describe('extract', () => {
    it('debe extraer escenarios candidatos y formatear la lista según la plantilla oficial', async () => {
      mockLLMProvider.generateStructured.mockResolvedValueOnce({
        scenarios: [
          {
            number: 1,
            title: 'CARGAR DOCUMENTACIÓN',
            type: 'Particular',
            justification: 'Acción del escribiente para subir archivos',
            sourceQuote: 'El escribiente ingresa la ruta de cada documento',
          },
          {
            number: 2,
            title: 'GESTIÓN DEL JUICIO',
            type: 'Integrador',
            justification: 'Organiza el proceso integral',
            sourceQuote: 'Inicia el juicio y fiscaliza',
          },
        ],
      });

      const response = await service.extract({
        projectName: 'Caso Gestión Documentos Juzgado',
        rawText: 'Transcripción de prueba...',
      });

      expect(response).toBeDefined();
      expect(response.projectName).toBe('Caso Gestión Documentos Juzgado');
      expect(response.scenarios).toHaveLength(2);
      expect(response.scenarios[0].title).toBe('CARGAR DOCUMENTACIÓN');
      expect(response.scenarios[1].type).toBe('Integrador');

      expect(response.formattedListMarkdown).toContain('ESCENARIOS');
      expect(response.formattedListMarkdown).toContain(
        'Proyecto: Caso Gestión Documentos Juzgado',
      );
      expect(response.formattedListMarkdown).toContain('LISTA DE ESCENARIOS');
      expect(response.formattedListMarkdown).toContain(
        '| 1 | CARGAR DOCUMENTACIÓN | Particular |',
      );
      expect(response.formattedListMarkdown).toContain(
        '| 2 | GESTIÓN DEL JUICIO | Integrador |',
      );
      expect(response.formattedListMarkdown).toContain(
        '(*) Tipo: <Integrador, Particular, Sub-Escenario o Excepción>',
      );
    });
  });

  describe('structure', () => {
    const sampleStructuredLLMOutput = {
      title: 'CARGAR DOCUMENTACIÓN',
      objective: 'Subir Documentos al sistema de gestión.',
      context: {
        geographicLocation: 'Sede Judicial',
        temporalLocation: 'Días hábiles',
        preconditions: [
          'El usuario se debe encontrar logueado.',
          'Los Documentos deben estar en los formatos admitidos.',
        ],
      },
      resources: ['Documento'],
      actors: ['Escribiente', 'Sistema'],
      episodes: [
        {
          number: 1,
          text: 'El Escribiente ingresa al módulo de almacenamiento de documentos.',
        },
        {
          number: 2,
          text: 'El Sistema solicita la ruta de los Documentos a cargar.',
        },
        {
          number: 3,
          text: 'El Escribiente ingresa la ruta de cada Documento que desea cargar al sistema.',
          restriction: 'Los Documentos no deben superar el peso de 100 MB.',
        },
        {
          number: 4,
          text: 'El Escribiente selecciona la opción de Aceptar.',
        },
        {
          number: 5,
          text: 'El Sistema genera un identificador único por cada Documento subido.',
        },
      ],
      exceptions: [
        {
          cause: 'El tipo de archivo a subir está en un formato no admitido.',
          treatment: 'El Sistema notifica los formatos admitidos.',
        },
      ],
    };

    it('debe estructurar un escenario, generar la descripción oficial y autovalidarlo determinísticamente por defecto', async () => {
      mockLLMProvider.generateStructured.mockResolvedValueOnce(
        sampleStructuredLLMOutput,
      );

      const response = await service.structure({
        projectName: 'Caso Gestión Documentos Juzgado',
        scenarioNumber: 1,
        scenarioTitle: 'CARGAR DOCUMENTACIÓN',
        scenarioRole: 'Particular',
        scenarioTimeframe: 'FUTURO',
        rawContextText: 'Fragmento de la minuta de reunión...',
      });

      expect(response).toBeDefined();
      expect(response.scenarioTitle).toBe('CARGAR DOCUMENTACIÓN');
      expect(response.formattedDescriptionMarkdown).toContain(
        'DESCRIPCIÓN DE ESCENARIOS',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        'Escenario Nro.: 1',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        'Título: CARGAR DOCUMENTACIÓN',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        'Tipo de escenario: Particular',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        'Objetivo: Subir Documentos al sistema de gestión.',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        'Recursos: Documento',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        'Actores: Escribiente, Sistema',
      );
      expect(response.formattedDescriptionMarkdown).toContain(
        '[Restricción: "Los Documentos no deben superar el peso de 100 MB."]',
      );

      expect(response.parsedScenario).toBeDefined();
      expect(response.parsedScenario.title).toBe('CARGAR DOCUMENTACIÓN');
      expect(response.parsedScenario.type).toBe('FUTURO');
      expect(response.parsedScenario.episodes).toHaveLength(5);
      expect(response.validationReport).toBeDefined();
      expect(typeof response.validationReport.isValid).toBe('boolean');
      expect(
        Array.isArray(response.validationReport.validations.deterministic),
      ).toBe(true);
      expect(mockSemanticValidator.validateSemantics).not.toHaveBeenCalled();
    });

    it('debe ejecutar validación semántica en structure cuando enableSemanticValidation es true', async () => {
      mockLLMProvider.generateStructured.mockResolvedValueOnce(
        sampleStructuredLLMOutput,
      );
      mockSemanticValidator.validateSemantics.mockResolvedValueOnce({
        issues: [
          {
            code: 'SEM_WHAT_VS_HOW',
            severity: 'WARNING',
            component: 'EPISODIOS',
            message: 'Episodio 4 menciona detalle de interfaz (opción Aceptar).',
            suggestion: 'Usar acción del dominio.',
            ragReference: 'Marco Teórico: Qué vs Cómo',
            episodeNumber: 4,
          },
        ],
        ragContextUsed: {
          marcoTeoricoChunks: 6,
          lelSymbols: ['Documento', 'Escribiente'],
        },
        llmProvider: 'gemini',
        llmModel: 'gemini-3.6-flash',
      });

      const response = await service.structure({
        projectName: 'Caso Gestión Documentos Juzgado',
        scenarioNumber: 1,
        scenarioTitle: 'CARGAR DOCUMENTACIÓN',
        scenarioRole: 'Particular',
        scenarioTimeframe: 'FUTURO',
        rawContextText: 'Fragmento de la minuta de reunión...',
        enableSemanticValidation: true,
      });

      expect(mockSemanticValidator.validateSemantics).toHaveBeenCalledTimes(1);
      expect(response.validationReport.validations.semantic).toHaveLength(1);
      expect(response.validationReport.summary.semanticIssuesCount).toBe(1);
      expect(response.validationReport.ragContextUsed).toEqual({
        marcoTeoricoChunks: 6,
        lelSymbols: ['Documento', 'Escribiente'],
      });
    });
  });
});
