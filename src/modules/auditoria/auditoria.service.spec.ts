import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaService, type AuditEntry } from './auditoria.service.js';

describe('AuditoriaService', () => {
  const base: Omit<AuditEntry, 'operacao'> = {
    usuarioId: 1,
    eventoId: 2,
    operacaoId: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
    entidade: 'RESULTADO_DESAFIO',
    registroId: 15,
  };

  function setup() {
    const tx = {
      auditoria: { create: vi.fn().mockResolvedValue({ id: 99 }) },
      auditoriaDetalhe: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new AuditoriaService({} as PrismaService);
    const record = (entry: AuditEntry) =>
      service.record(tx as unknown as Prisma.TransactionClient, entry);
    return { tx, record };
  }

  function savedDetails(tx: ReturnType<typeof setup>['tx']) {
    return tx.auditoriaDetalhe.createMany.mock.calls[0][0].data;
  }

  it('grava todos os campos de um INSERT com valor anterior nulo', async () => {
    const { tx, record } = setup();

    await expect(
      record({
        ...base,
        operacao: 'INSERT',
        after: { colocacao: 2, ausente: false },
      }),
    ).resolves.toBe(true);

    expect(tx.auditoria.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 1,
        eventoId: 2,
        operacaoId: base.operacaoId,
        entidade: 'RESULTADO_DESAFIO',
        registroId: 15,
        operacao: 'INSERT',
        descricao: undefined,
        justificativa: undefined,
        afetaResultado: true,
      },
      select: { id: true },
    });
    expect(savedDetails(tx)).toEqual([
      {
        auditoriaId: 99,
        campo: 'ausente',
        valorAnterior: null,
        valorNovo: 'false',
      },
      {
        auditoriaId: 99,
        campo: 'colocacao',
        valorAnterior: null,
        valorNovo: '2',
      },
    ]);
  });

  it('grava só os campos alterados em um UPDATE', async () => {
    const { tx, record } = setup();

    await record({
      ...base,
      operacao: 'UPDATE',
      before: { colocacao: 2, ausente: false },
      after: { colocacao: 1, ausente: false },
    });

    expect(savedDetails(tx)).toEqual([
      {
        auditoriaId: 99,
        campo: 'colocacao',
        valorAnterior: '2',
        valorNovo: '1',
      },
    ]);
  });

  it('não grava nada quando o UPDATE reenvia os mesmos valores', async () => {
    const { tx, record } = setup();

    await expect(
      record({
        ...base,
        operacao: 'UPDATE',
        before: { colocacao: 2 },
        after: { colocacao: 2 },
      }),
    ).resolves.toBe(false);

    expect(tx.auditoria.create).not.toHaveBeenCalled();
    expect(tx.auditoriaDetalhe.createMany).not.toHaveBeenCalled();
  });

  it('grava os campos de um DELETE com valor novo nulo', async () => {
    const { tx, record } = setup();

    await record({
      ...base,
      entidade: 'PENALIDADE',
      operacao: 'DELETE',
      before: { valor: 20 },
    });

    expect(savedDetails(tx)).toEqual([
      { auditoriaId: 99, campo: 'valor', valorAnterior: '20', valorNovo: null },
    ]);
  });

  it('grava um RECALCULO mesmo sem campos alterados', async () => {
    const { tx, record } = setup();

    await expect(
      record({
        ...base,
        entidade: 'APURACAO',
        operacao: 'RECALCULO',
        descricao: 'Classificação recalculada',
      }),
    ).resolves.toBe(true);

    expect(tx.auditoria.create).toHaveBeenCalledOnce();
    expect(tx.auditoriaDetalhe.createMany).not.toHaveBeenCalled();
  });

  it('repassa descrição, justificativa e afetaResultado informados', async () => {
    const { tx, record } = setup();

    await record({
      ...base,
      operacao: 'INSERT',
      after: { colocacao: 1 },
      descricao: 'Lançamento inicial',
      justificativa: 'Súmula do desafio',
      afetaResultado: false,
    });

    expect(tx.auditoria.create.mock.calls[0][0].data).toMatchObject({
      descricao: 'Lançamento inicial',
      justificativa: 'Súmula do desafio',
      afetaResultado: false,
    });
  });

  it('converte datas, decimais, booleanos e nulos para texto comparável', async () => {
    const { tx, record } = setup();

    await record({
      ...base,
      operacao: 'UPDATE',
      before: {
        dataHora: new Date('2026-11-23T14:38:00.000Z'),
        fator: new Prisma.Decimal('0.5'),
        presente: true,
        observacao: null,
        igual: new Prisma.Decimal('1'),
      },
      after: {
        dataHora: new Date('2026-11-23T15:02:00.000Z'),
        fator: new Prisma.Decimal('1'),
        presente: false,
        observacao: 'corrigido',
        igual: 1,
      },
    });

    expect(savedDetails(tx)).toEqual([
      {
        auditoriaId: 99,
        campo: 'dataHora',
        valorAnterior: '2026-11-23T14:38:00.000Z',
        valorNovo: '2026-11-23T15:02:00.000Z',
      },
      { auditoriaId: 99, campo: 'fator', valorAnterior: '0.5', valorNovo: '1' },
      {
        auditoriaId: 99,
        campo: 'observacao',
        valorAnterior: null,
        valorNovo: 'corrigido',
      },
      {
        auditoriaId: 99,
        campo: 'presente',
        valorAnterior: 'true',
        valorNovo: 'false',
      },
    ]);
  });

  describe('list', () => {
    function setupList(rows: unknown[]) {
      const prisma = {
        auditoria: { findMany: vi.fn().mockResolvedValue(rows) },
      };
      const service = new AuditoriaService(prisma as unknown as PrismaService);
      return { prisma, service };
    }

    const usuario = { nome: 'Administrador Arena' };

    it('consulta o registro em ordem cronológica com usuário e campos', async () => {
      const { prisma, service } = setupList([]);

      await service.list('RESULTADO_DESAFIO', 15);

      expect(prisma.auditoria.findMany).toHaveBeenCalledWith({
        where: { entidade: 'RESULTADO_DESAFIO', registroId: 15 },
        orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
        select: {
          dataHora: true,
          operacao: true,
          usuario: { select: { nome: true } },
          detalhes: {
            select: { campo: true, valorAnterior: true, valorNovo: true },
            orderBy: { campo: 'asc' },
          },
        },
      });
    });

    it('devolve lista vazia quando o registro não tem histórico', async () => {
      const { service } = setupList([]);

      await expect(service.list('PENALIDADE', 3)).resolves.toEqual([]);
    });

    it('monta os itens no formato do front', async () => {
      const { service } = setupList([
        {
          dataHora: new Date('2026-11-23T14:38:00.123Z'),
          operacao: 'INSERT',
          usuario,
          detalhes: [
            { campo: 'ausente', valorAnterior: null, valorNovo: 'false' },
            { campo: 'colocacao', valorAnterior: null, valorNovo: '2' },
          ],
        },
        {
          dataHora: new Date('2026-11-23T15:02:00.000Z'),
          operacao: 'UPDATE',
          usuario,
          detalhes: [
            { campo: 'colocacao', valorAnterior: '2', valorNovo: '1' },
          ],
        },
      ]);

      await expect(service.list('RESULTADO_DESAFIO', 15)).resolves.toEqual([
        {
          dataHora: '2026-11-23T14:38:00Z',
          usuario: 'Administrador Arena',
          operacao: 'INSERT',
          valorAnterior: null,
          valorNovo: 'ausente=false; colocacao=2',
        },
        {
          dataHora: '2026-11-23T15:02:00Z',
          usuario: 'Administrador Arena',
          operacao: 'UPDATE',
          valorAnterior: 'colocacao=2',
          valorNovo: 'colocacao=1',
        },
      ]);
    });

    it('omite campos sem valor e usa null quando um lado fica vazio', async () => {
      const { service } = setupList([
        {
          dataHora: new Date('2026-11-23T16:00:00.000Z'),
          operacao: 'UPDATE',
          usuario,
          detalhes: [
            { campo: 'observacao', valorAnterior: null, valorNovo: 'atraso' },
            { campo: 'pontos', valorAnterior: '5', valorNovo: '3' },
          ],
        },
        {
          dataHora: new Date('2026-11-23T17:00:00.000Z'),
          operacao: 'DELETE',
          usuario,
          detalhes: [{ campo: 'pontos', valorAnterior: '3', valorNovo: null }],
        },
        {
          dataHora: new Date('2026-11-23T18:00:00.000Z'),
          operacao: 'RECALCULO',
          usuario,
          detalhes: [],
        },
      ]);

      const items = await service.list('PENALIDADE', 4);

      expect(
        items.map(({ valorAnterior, valorNovo }) => [valorAnterior, valorNovo]),
      ).toEqual([
        ['pontos=5', 'observacao=atraso; pontos=3'],
        ['pontos=3', null],
        [null, null],
      ]);
    });
  });
});
