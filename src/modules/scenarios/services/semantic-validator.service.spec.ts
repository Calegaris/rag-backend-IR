import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { LLMFactory } from '../../llm/llm.factory';
import { ILLMProvider } from '../../llm/llm.interface';
import { DocType } from '../../rag/dto/rag-search.dto';
import { RagService } from '../../rag/rag.service';
import { ScenarioStructure } from '../parser/parser.types';
import { SemanticValidatorService } from './semantic-validator.service';

describe('SemanticValidatorService', () => {
  let service: SemanticValidatorService;
  let mockRagService: {
    search: jest.Mock;
  };
  let mockLLMProvider: jest.Mocked<ILLMProvider>;
  let mockLLMFactory: {
    getProvider: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  const sampleScenario: ScenarioStructure = {
    title: 'CARGAR DOCUMENTACIÓN',
    type: 'FUTURO',
    rawRole: 'Particular',
    scenarioNumber: 1,
    objective: 'Subir archivos digitales al expediente.',
    contextGeo: 'Sede Judicial',
    contextTime: 'Días hábiles',
    contextPrecond: 'El Escribiente se encuentra autenticado en el sistema.',
    actors: ['Escribiente', 'Sistema'],
    resources: ['Archivo PDF'],
    episodes: [
      {
        number: 1,
        text: 'Si el Escribiente está autenticado, hace clic en el botón azul "Subir".',
        type: 'CONDITIONAL',
        rawText:
          '1. Si el Escribiente está autenticado, hace clic en el botón azul "Subir".',
      },
      {
        number: 2,
        text: 'El Sistema almacena el Archivo PDF.',
        type: 'SIMPLE',
        rawText: '2. El Sistema almacena el Archivo PDF.',
      },
    ],
    exceptions: [
      {
        causa: 'El archivo supera el tamaño máximo',
        tratamiento: 'El Sistema informa el error',
      },
    ],
    rawMarkdown: 'Título: CARGAR DOCUMENTACIÓN...',
  };

  beforeEach(async () => {
    mockRagService = {
      search: jest.fn(),
    };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticValidatorService,
        { provide: RagService, useValue: mockRagService },
        { provide: LLMFactory, useValue: mockLLMFactory },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SemanticValidatorService>(SemanticValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should retrieve LEL (topK: 10) and MARCO_TEORICO (topK: 6) from RagService, extract deduplicated LEL symbols, and return structured semantic issues', async () => {
    mockRagService.search
      .mockResolvedValueOnce({
        query: 'mock query',
        count: 3,
        results: [
          {
            id: 'lel-1',
            documentId: 'doc-lel',
            documentTitle: 'LEL Juzgado',
            docType: DocType.LEL,
            content:
              'Símbolo LEL: Documento\nCategoría: Objeto\nNoción: Escrito judicial.\nImpacto: Se adjunta al expediente.',
            metadata: { symbolName: 'Documento', category: 'Objeto' },
            similarity: 0.91,
          },
          {
            id: 'lel-2',
            documentId: 'doc-lel',
            documentTitle: 'LEL Juzgado',
            docType: DocType.LEL,
            content:
              'Símbolo LEL: Escribiente\nCategoría: Sujeto\nNoción: Empleado del juzgado.\nImpacto: Carga documentos.',
            metadata: { symbolName: 'Escribiente', category: 'Sujeto' },
            similarity: 0.88,
          },
          {
            id: 'lel-3',
            documentId: 'doc-lel',
            documentTitle: 'LEL Juzgado',
            docType: DocType.LEL,
            content:
              'Símbolo LEL: Documento\nCategoría: Objeto\nNoción: Duplicado.',
            metadata: {},
            similarity: 0.85,
          },
        ],
      })
      .mockResolvedValueOnce({
        query: 'mock query',
        count: 2,
        results: [
          {
            id: 'mt-1',
            documentId: 'doc-mt-1',
            documentTitle: 'Reglas de Contexto y Episodios',
            docType: DocType.MARCO_TEORICO,
            content:
              '[Marco Teórico: Contexto] Los episodios no deben volver a verificar precondiciones.',
            metadata: { sectionHeading: 'No Redundancia' },
            similarity: 0.89,
          },
          {
            id: 'mt-2',
            documentId: 'doc-mt-2',
            documentTitle: 'Enfoque Qué vs Cómo',
            docType: DocType.MARCO_TEORICO,
            content:
              '[Marco Teórico: Episodios] Evitar detalles de interfaz gráfica.',
            metadata: { sectionHeading: 'Qué vs Cómo' },
            similarity: 0.84,
          },
        ],
      });

    mockLLMProvider.generateStructured.mockResolvedValueOnce({
      issues: [
        {
          code: 'SEM_LEL_CONSISTENCY',
          severity: 'ERROR',
          component: 'RECURSOS',
          message:
            'Se utiliza el término "Archivo PDF" en lugar del símbolo LEL "Documento".',
          suggestion: 'Reemplazar "Archivo PDF" por el símbolo LEL "Documento".',
          ragReference: 'Símbolo LEL: Documento (Objeto)',
        },
        {
          code: 'SEM_PRECONDITION_REDUNDANCY',
          severity: 'ERROR',
          component: 'EPISODIOS',
          message:
            'El episodio 1 vuelve a verificar si el Escribiente está autenticado, lo cual ya es una Precondición.',
          suggestion:
            'Eliminar la condición redundante del episodio 1 ya garantizada por el Contexto.',
          ragReference: 'Marco Teórico: Reglas de Contexto - No Redundancia',
          episodeNumber: 1,
        },
        {
          code: 'SEM_WHAT_VS_HOW',
          severity: 'WARNING',
          component: 'EPISODIOS',
          message:
            'El episodio 1 menciona detalles de UI ("hace clic en el botón azul Subir").',
          suggestion:
            'Expresar la interacción en términos del dominio ("solicita cargar el Documento").',
          ragReference: 'Marco Teórico: Episodios - Qué vs Cómo',
          episodeNumber: 1,
        },
      ],
    });

    const result = await service.validateSemantics(sampleScenario, [], {
      projectName: 'Gestión de Documentos en Juzgado',
      apiKeyOverride: 'custom-key',
    });

    expect(mockRagService.search).toHaveBeenCalledTimes(2);
    expect(mockRagService.search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: DocType.LEL,
        projectName: 'Gestión de Documentos en Juzgado',
        topK: 10,
      }),
      'custom-key',
    );
    expect(mockRagService.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: DocType.MARCO_TEORICO,
        topK: 6,
      }),
      'custom-key',
    );

    expect(mockLLMProvider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.1,
        apiKeyOverride: 'custom-key',
        modelOverride: 'gemini-3.6-flash',
      }),
    );

    expect(result.ragContextUsed).toEqual({
      marcoTeoricoChunks: 2,
      lelSymbols: ['Documento', 'Escribiente'],
    });
    expect(result.llmProvider).toBe('gemini');
    expect(result.issues).toHaveLength(3);
    expect(result.issues[0].code).toBe('SEM_LEL_CONSISTENCY');
    expect(result.issues[1].code).toBe('SEM_PRECONDITION_REDUNDANCY');
    expect(result.issues[1].episodeNumber).toBe(1);
    expect(result.issues[2].code).toBe('SEM_WHAT_VS_HOW');
  });
});
