import {
  SecurityTelemetryService,
  LIMITE_INATIVIDADE_MS,
} from './security-telemetry.service.js';

describe('SecurityTelemetryService', () => {
  const prisma = {
    authSession: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    telemetryPeriod: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    telemetryEvent: { create: vi.fn(), deleteMany: vi.fn() },
  };
  const service = new SecurityTelemetryService(prisma as never);
  beforeEach(() => vi.clearAllMocks());

  it('renova sessão persistida após atividade real', async () => {
    const now = new Date();
    prisma.authSession.findUnique.mockResolvedValue({
      id: 's',
      usuarioId: 9,
      endedAt: null,
      expiresAt: new Date(now.getTime() + 3600000),
      lastActivityAt: new Date(now.getTime() - 1000),
    });
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.validarEAtualizarSessao('s', 9)).resolves.toBe(true);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastActivityAt: expect.any(Date) } }),
    );
  });

  it('valida evento automático sem renovar o último acesso', async () => {
    const now = new Date();
    const lastActivityAt = new Date(now.getTime() - 60_000);
    prisma.authSession.findUnique.mockResolvedValue({
      id: 's',
      usuarioId: 9,
      endedAt: null,
      expiresAt: new Date(now.getTime() + 3600000),
      lastActivityAt,
    });

    await expect(service.validarSessaoSemRenovar('s', 9)).resolves.toBe(true);

    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('encerra sessão após 15 minutos sem atividade', async () => {
    const now = new Date();
    prisma.authSession.findUnique.mockResolvedValue({
      id: 's',
      usuarioId: 9,
      endedAt: null,
      expiresAt: new Date(now.getTime() + 3600000),
      lastActivityAt: new Date(now.getTime() - LIMITE_INATIVIDADE_MS - 1),
    });
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.telemetryPeriod.findFirst.mockResolvedValue({ id: 'period' });
    prisma.telemetryEvent.create.mockResolvedValue({});
    await expect(service.validarEAtualizarSessao('s', 9)).resolves.toBe(false);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endReason: 'EXPIRED',
          purgeAfter: expect.any(Date),
        }),
      }),
    );
  });

  it('não aceita outra pessoa nem sessão já encerrada', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 's',
      usuarioId: 9,
      endedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
      lastActivityAt: new Date(),
    });
    await expect(service.validarEAtualizarSessao('s', 10)).resolves.toBe(false);
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('persiste somente metadados fornecidos, sem payload de requisição', async () => {
    prisma.telemetryPeriod.findFirst.mockResolvedValue({ id: 'period' });
    await service.registrarEvento({
      source: 'API',
      eventType: 'API_REQUEST',
      outcome: 'SUCCESS',
      method: 'GET',
      route: '/api/v1/eventos/:id',
      status: 200,
      durationMs: 12,
      details: { operation: 'read' },
    });
    expect(prisma.telemetryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: { operation: 'read' },
          route: '/api/v1/eventos/:id',
        }),
      }),
    );
    expect(JSON.stringify(prisma.telemetryEvent.create.mock.calls)).not.toMatch(
      /senha|token|cookie|body/i,
    );
  });
});
