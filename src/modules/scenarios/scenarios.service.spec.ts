import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ScenariosService } from './scenarios.service';
import { MarkdownParserService } from './parser/markdown-parser.service';
import { DeterministicValidatorService } from './validator/deterministic-validator.service';
import { LLMFactory } from '../llm/llm.factory';
import { ILLMProvider } from '../llm/llm.interface';

describe('ScenariosService', () => {
  let service: ScenariosService;
  let mockLLMProvider: jest.Mocked<ILLMProvider>;
  let mockLLMFactory: Partial<LLMFactory>;
  let mockConfigService: Partial<ConfigService>;

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
        if (key === 'llm.model') return 'gemini-2.5-flash';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScenariosService,
        MarkdownParserService,
        DeterministicValidatorService,
        { provide: LLMFactory, useValue: mockLLMFactory },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
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

      // Validar presencia de secciones de la plantilla oficial
      expect(response.formattedListMarkdown).toContain('ESCENARIOS');
      expect(response.formattedListMarkdown).toContain('Proyecto: Caso Gestión Documentos Juzgado');
      expect(response.formattedListMarkdown).toContain('LISTA DE ESCENARIOS');
      expect(response.formattedListMarkdown).toContain('| 1 | CARGAR DOCUMENTACIÓN | Particular |');
      expect(response.formattedListMarkdown).toContain('| 2 | GESTIÓN DEL JUICIO | Integrador |');
      expect(response.formattedListMarkdown).toContain('(*) Tipo: <Integrador, Particular, Sub-Escenario o Excepción>');
    });
  });

  describe('structure', () => {
    it('debe estructurar un escenario, generar la descripción oficial y autovalidarlo con el Checklist v3', async () => {
      mockLLMProvider.generateStructured.mockResolvedValueOnce({
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
      });

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
      expect(response.formattedDescriptionMarkdown).toContain('DESCRIPCIÓN DE ESCENARIOS');
      expect(response.formattedDescriptionMarkdown).toContain('Escenario Nro.: 1');
      expect(response.formattedDescriptionMarkdown).toContain('Título: CARGAR DOCUMENTACIÓN');
      expect(response.formattedDescriptionMarkdown).toContain('Tipo de escenario: Particular');
      expect(response.formattedDescriptionMarkdown).toContain('Objetivo: Subir Documentos al sistema de gestión.');
      expect(response.formattedDescriptionMarkdown).toContain('Recursos: Documento');
      expect(response.formattedDescriptionMarkdown).toContain('Actores: Escribiente, Sistema');
      expect(response.formattedDescriptionMarkdown).toContain('[Restricción: "Los Documentos no deben superar el peso de 100 MB."]');

      // Validar que se parseó y pasó por el validador determinístico
      expect(response.parsedScenario).toBeDefined();
      expect(response.parsedScenario.title).toBe('CARGAR DOCUMENTACIÓN');
      expect(response.parsedScenario.episodes).toHaveLength(5);
      expect(response.validationReport).toBeDefined();
      expect(typeof response.validationReport.isValid).toBe('boolean');
      expect(Array.isArray(response.validationReport.validations.deterministic)).toBe(true);
    });
  });
});
