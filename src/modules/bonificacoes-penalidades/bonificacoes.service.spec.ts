import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BonificacoesService } from './bonificacoes.service.js';

describe('BonificacoesService', () => {
  function setup() {
    const tx = {
      bonificacaoGrupo: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 10 }),
        update: vi.fn().mockResolvedValue({ id: 10 }),
        delete: vi.fn().mockResolvedValue({ id: 10 }),
      },
    };
    const prisma = {
      evento: { findUnique: vi.fn() },
      grupo: { findUnique: vi.fn() },
      itemBonificacao: { findMany: vi.fn() },
      bonificacaoGrupo: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { record: vi.fn() };
    const service = new BonificacoesService(prisma as never, audit as never);
    return { prisma, tx, audit, service };
  }

  const summaryEntry = {
    id: 10,
    valor: 8,
    grupo: { id: 2, nome: 'Alfa' },
    itemBonificacao: { id: 3, nome: 'Uniformização', teto: 10 },
  };

  it('lista bonificações do evento', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([summaryEntry]);

    await expect(service.list(1)).resolves.toEqual([
      {
        grupoId: 2,
        itens: [{ id: 10, itemBonificacaoId: 3, valor: 8 }],
        total: 8,
      },
    ]);
  });

  it('cria itens novos e audita INSERT no caminho feliz', async () => {
    const { prisma, tx, audit, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([
      { id: 3, nome: 'Uniformização', teto: 10 },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([summaryEntry]);

    const result = await service.replaceForGroup(
      1,
      2,
      [{ itemBonificacaoId: 3, valor: 8 }],
      99,
    );

    expect(tx.bonificacaoGrupo.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operacao: 'INSERT', registroId: 10 }),
    );
    expect(result).toEqual({
      grupoId: 2,
      itens: [{ id: 10, itemBonificacaoId: 3, valor: 8 }],
      total: 8,
    });
  });

  it('reenvio com os mesmos valores não grava nem audita (idempotente)', async () => {
    const { prisma, tx, audit, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([
      { id: 3, nome: 'Uniformização', teto: 10 },
    ]);
    tx.bonificacaoGrupo.findMany.mockResolvedValue([
      { id: 10, itemBonificacaoId: 3, valor: 8 },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([summaryEntry]);

    await service.replaceForGroup(
      1,
      2,
      [{ itemBonificacaoId: 3, valor: 8 }],
      99,
    );

    expect(tx.bonificacaoGrupo.create).not.toHaveBeenCalled();
    expect(tx.bonificacaoGrupo.update).not.toHaveBeenCalled();
    expect(tx.bonificacaoGrupo.delete).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('atualiza valor existente preservando o id e audita UPDATE', async () => {
    const { prisma, tx, audit, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([
      { id: 3, nome: 'Uniformização', teto: 10 },
    ]);
    tx.bonificacaoGrupo.findMany.mockResolvedValue([
      { id: 10, itemBonificacaoId: 3, valor: 4 },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([summaryEntry]);

    await service.replaceForGroup(
      1,
      2,
      [{ itemBonificacaoId: 3, valor: 8 }],
      99,
    );

    expect(tx.bonificacaoGrupo.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { valor: 8 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operacao: 'UPDATE', registroId: 10 }),
    );
  });

  it('remove item omitido no payload e audita DELETE', async () => {
    const { prisma, tx, audit, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([
      { id: 3, nome: 'Uniformização', teto: 10 },
    ]);
    tx.bonificacaoGrupo.findMany.mockResolvedValue([
      { id: 11, itemBonificacaoId: 4, valor: 5 },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([]);

    await service.replaceForGroup(1, 2, [], 99);

    expect(tx.bonificacaoGrupo.delete).toHaveBeenCalledWith({
      where: { id: 11 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operacao: 'DELETE', registroId: 11 }),
    );
  });

  it('recusa item de outro evento', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });
    prisma.itemBonificacao.findMany.mockResolvedValue([]);

    await expect(
      service.replaceForGroup(1, 2, [{ itemBonificacaoId: 3, valor: 1 }], 99),
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
      service.replaceForGroup(1, 2, [{ itemBonificacaoId: 3, valor: 11 }], 99),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('recusa item duplicado no payload', async () => {
    const { prisma, service } = setup();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.grupo.findUnique.mockResolvedValue({ id: 2 });

    await expect(
      service.replaceForGroup(
        1,
        2,
        [
          { itemBonificacaoId: 3, valor: 1 },
          { itemBonificacaoId: 3, valor: 2 },
        ],
        99,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
