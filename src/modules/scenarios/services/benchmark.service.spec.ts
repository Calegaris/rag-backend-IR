import { Test, TestingModule } from '@nestjs/testing';
import { MarkdownParserService } from '../parser/markdown-parser.service';
import { DeterministicValidatorService } from '../validator/deterministic-validator.service';
import { BenchmarkService } from './benchmark.service';
import { SemanticValidatorService } from './semantic-validator.service';

describe('BenchmarkService', () => {
  let service: BenchmarkService;
  let mockSemanticValidator: {
    validateSemantics: jest.Mock;
  };

  beforeEach(async () => {
    mockSemanticValidator = {
      validateSemantics: jest.fn().mockResolvedValue({
        issues: [],
        ragContextUsed: {
          marcoTeoricoChunks: 6,
          lelSymbols: ['Documento', 'Escribiente', 'Proceso Judicial'],
        },
        llmProvider: 'gemini',
        llmModel: 'gemini-3.6-flash',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkService,
        MarkdownParserService,
        DeterministicValidatorService,
        {
          provide: SemanticValidatorService,
          useValue: mockSemanticValidator,
        },
      ],
    }).compile();

    service = module.get<BenchmarkService>(BenchmarkService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should load and audit all 12 scenarios from default 03-escenarios-futuros.md with enableSemantic: false', async () => {
    const result = await service.runBenchmark({
      enableSemantic: false,
    });

    expect(result.projectName).toBe('Gestión de Documentos en Juzgado');
    expect(result.totalScenarios).toBe(12);
    expect(result.scenarios).toHaveLength(12);
    expect(mockSemanticValidator.validateSemantics).not.toHaveBeenCalled();

    expect(result.scenarios[0].scenarioNumber).toBe(1);
    expect(result.scenarios[0].title).toBe('CARGAR DOCUMENTACIÓN');
    expect(result.scenarios[10].scenarioNumber).toBe(11);
    expect(result.scenarios[10].title).toBe('GESTIÓN DEL JUICIO');
    expect(result.scenarios[10].type).toBe('INTEGRADOR');
    expect(result.scenarios[11].scenarioNumber).toBe(12);
    expect(result.scenarios[11].title).toBe('LOGEAR AL SISTEMA');
  });

  it('should run semantic validation on each scenario when enableSemantic is true (default) and aggregate metrics', async () => {
    const customMultiScenarioMarkdown = `
### Escenario Nº: 1
- **Título**: CARGAR DOCUMENTACIÓN
- **Tipo**: Particular
- **Objetivo**: Subir Documentos al sistema de gestión.
- **Contexto**:
  - **Ubicación Geográfica**: Sede Judicial
  - **Ubicación Temporal**: Días hábiles
  - **Precondiciones**:
    - El Escribiente se encuentra registrado.
- **Recursos**: Documento
- **Actores**: Escribiente, Sistema
- **Episodios**:
  1. El Escribiente ingresa el Documento al sistema.
  2. El Sistema registra el Documento.
- **Excepciones**:
  - Causa: Formato inválido. Tratamiento: El Sistema informa los formatos admitidos.

---

### Escenario Nº: 2
- **Título**: LISTAR DOCUMENTOS
- **Tipo**: Sub-Escenario
- **Objetivo**: Consultar Documentos asociados al Proceso Judicial.
- **Contexto**:
  - **Precondiciones**:
    - El Proceso Judicial existe.
- **Recursos**: Proceso Judicial, Documento
- **Actores**: Escribiente, Sistema
- **Episodios**:
  1. El Escribiente selecciona el Proceso Judicial.
  2. El Sistema muestra los Documentos del Proceso Judicial.
- **Excepciones**:
  - Causa: Sin documentos. Tratamiento: El Sistema informa bandeja vacía.
`;

    mockSemanticValidator.validateSemantics
      .mockResolvedValueOnce({
        issues: [],
        ragContextUsed: {
          marcoTeoricoChunks: 6,
          lelSymbols: ['Documento', 'Escribiente'],
        },
        llmProvider: 'gemini',
        llmModel: 'gemini-3.6-flash',
      })
      .mockResolvedValueOnce({
        issues: [
          {
            code: 'SEM_WHAT_VS_HOW',
            severity: 'ERROR',
            component: 'EPISODIOS',
            message: 'Detalle de interfaz innecesario.',
            suggestion: 'Usar lenguaje de dominio.',
            ragReference: 'Marco Teórico: Qué vs Cómo',
            episodeNumber: 1,
          },
        ],
        ragContextUsed: {
          marcoTeoricoChunks: 6,
          lelSymbols: ['Proceso Judicial', 'Documento'],
        },
        llmProvider: 'gemini',
        llmModel: 'gemini-3.6-flash',
      });

    const result = await service.runBenchmark(
      {
        projectName: 'Gestión de Documentos en Juzgado',
        rawMarkdown: customMultiScenarioMarkdown,
        enableSemantic: true,
      },
      'custom-api-key',
    );

    expect(result.totalScenarios).toBe(2);
    expect(result.validScenariosCount).toBe(1);
    expect(result.invalidScenariosCount).toBe(1);
    expect(result.totalSemanticIssues).toBe(1);
    expect(result.scenarios[0].isValid).toBe(true);
    expect(result.scenarios[1].isValid).toBe(false);
    expect(result.scenarios[1].validations.semantic).toHaveLength(1);
  });
});
