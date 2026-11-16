import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BonificacoesService } from './bonificacoes.service.js';

describe('BonificacoesService', () => {
  function setup() {
    const prisma = {
      evento: { findUnique: vi.fn() },
      grupo: { findUnique: vi.fn() },
      itemBonificacao: { findMany: vi.fn() },
      bonificacaoGrupo: {
        findMany: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          bonificacaoGrupo: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
          },
        }),
      ),
    };
    return { prisma, service: new BonificacoesService(prisma as never) };
  }

  it('lista bonificações do evento', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([
      {
        id: 1,
        valor: 8,
        grupo: { id: 2, nome: 'Alfa' },
        itemBonificacao: { id: 3, nome: 'Uniformização', teto: 10 },
      },
    ]);

    await expect(service.list(1)).resolves.toEqual([
      {
        id: 1,
        itemBonificacaoId: 3,
        itemNome: 'Uniformização',
        teto: 10,
        grupoId: 2,
        grupo: 'Alfa',
        valor: 8,
      },
    ]);
  });

  it('recusa item de outro evento', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([]);

    await expect(
      service.replaceForGroup(1, 2, {
        bonificacoes: [{ itemBonificacaoId: 3, valor: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa valor acima do teto', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([
      { id: 3, nome: 'Uniformização', teto: 10 },
    ]);

    await expect(
      service.replaceForGroup(1, 2, {
        bonificacoes: [{ itemBonificacaoId: 3, valor: 11 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('recusa item duplicado no payload', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });

    await expect(
      service.replaceForGroup(1, 2, {
        bonificacoes: [
          { itemBonificacaoId: 3, valor: 1 },
          { itemBonificacaoId: 3, valor: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
