import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: PrismaService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should return ok when database is connected and vector extension is installed', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([{ extname: 'vector' }]);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.pgvector).toBe('ready');
  });

  it('should return error when vector extension is not found', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([]);

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.database).toBe('connected');
    expect(result.pgvector).toBe('not_installed');
  });

  it('should return error when database connection fails', async () => {
    mockPrismaService.$queryRaw.mockRejectedValue(new Error('Connection timeout'));

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.database).toBe('disconnected');
    expect(result.pgvector).toBe('error');
    expect(result.error).toBe('Connection timeout');
  });
});
