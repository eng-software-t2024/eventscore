import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PenalidadesService } from './penalidades.service.js';

describe('PenalidadesService', () => {
  function setup() {
    const prisma = {
      evento: { findUnique: vi.fn() },
      grupo: { findUnique: vi.fn() },
      penalidade: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          penalidade: {
            create: vi.fn().mockResolvedValue({
              id: 4,
              descricao: 'Atraso',
              pontos: 20,
              justificativa: 'Iniciou depois do horário',
              grupo: { id: 2, nome: 'Alfa' },
            }),
            update: vi.fn(),
            delete: vi.fn(),
          },
        }),
      ),
    };
    const audit = { record: vi.fn() };
    return {
      prisma,
      service: new PenalidadesService(prisma as never, audit as never),
    };
  }

  it('cria penalidade dentro da faixa do evento', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({
      id: 1,
      penalidadeMin: 10,
      penalidadeMax: 50,
    });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    await expect(
      service.create(
        1,
        {
          grupoId: 2,
          descricao: 'Atraso',
          pontos: 20,
          justificativa: 'Iniciou depois do horário',
        },
        99,
      ),
    ).resolves.toMatchObject({ id: 4, grupoId: 2, pontos: 20 });
  });

  it('recusa faixa não configurada ou pontos fora da faixa', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({
      id: 1,
      penalidadeMin: null,
      penalidadeMax: null,
    });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });

    await expect(
      service.create(
        1,
        { grupoId: 2, pontos: 20, justificativa: 'Motivo' },
        99,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    prisma.evento.findUnique.mockResolvedValue({
      id: 1,
      penalidadeMin: 10,
      penalidadeMax: 50,
    });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    await expect(
      service.create(1, { grupoId: 2, pontos: 5, justificativa: 'Motivo' }, 99),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('não aceita penalidade de outro evento', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({
      id: 1,
      penalidadeMin: 10,
      penalidadeMax: 50,
    });
    prisma.penalidade.findUnique.mockResolvedValue({
      id: 4,
      grupoId: 2,
      pontos: 20,
      grupo: { id: 2, eventoId: 9, nome: 'Outro' },
    });

    await expect(service.remove(1, 4, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
