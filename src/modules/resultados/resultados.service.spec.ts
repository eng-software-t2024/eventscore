import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ResultadosService } from './resultados.service.js';

function createMocks() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    evento: { findUnique: vi.fn() },
    desafio: { findUnique: vi.fn() },
    grupo: { findMany: vi.fn() },
    resultadoDesafio: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };

  const prisma = {
    evento: { findUnique: vi.fn() },
    desafio: { findUnique: vi.fn() },
    grupo: { findMany: vi.fn() },
    resultadoDesafio: { findMany: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  const audit = {
    record: vi.fn().mockResolvedValue(true),
  };

  return { prisma, tx, audit };
}

describe('ResultadosService', () => {
  it('lista linhas pendentes antes do primeiro lançamento sem gravar nada', async () => {
    const { prisma } = createMocks();
    prisma.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });
    prisma.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.resultadoDesafio.findMany.mockResolvedValue([]);

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      {} as AuditoriaService,
    );
    const result = await service.list(1, 3);

    expect(result).toEqual([
      { id: null, grupoId: 1, colocacao: null, ausente: false, pontos: 0 },
      { id: null, grupoId: 2, colocacao: null, ausente: false, pontos: 0 },
    ]);
  });

  it('lista desafio válido sem grupos retornando array vazio', async () => {
    const { prisma } = createMocks();
    prisma.desafio.findUnique.mockResolvedValue({ id: 3, pontosColocacao: [] });
    prisma.grupo.findMany.mockResolvedValue([]);

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      {} as AuditoriaService,
    );

    await expect(service.list(1, 3)).resolves.toEqual([]);
    expect(prisma.resultadoDesafio.findMany).not.toHaveBeenCalled();
  });

  it('lista resultados persistidos incluindo ausência gravada com pontos zero', async () => {
    const { prisma } = createMocks();
    prisma.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });
    prisma.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.resultadoDesafio.findMany.mockResolvedValue([
      { id: 11, grupoId: 1, colocacao: 1, ausente: false },
      { id: 12, grupoId: 2, colocacao: null, ausente: true },
    ]);

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      {} as AuditoriaService,
    );

    await expect(service.list(1, 3)).resolves.toEqual([
      { id: 11, grupoId: 1, colocacao: 1, ausente: false, pontos: 100 },
      { id: 12, grupoId: 2, colocacao: null, ausente: true, pontos: 0 },
    ]);
  });

  it('lança 404 para evento ou desafio inexistente/de outro evento', async () => {
    const { prisma } = createMocks();
    prisma.desafio.findUnique.mockResolvedValue(null);
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      {} as AuditoriaService,
    );

    await expect(service.list(1, 99)).rejects.toThrow(NotFoundException);

    prisma.evento.findUnique.mockResolvedValue(null);
    await expect(service.list(99, 3)).rejects.toThrow(NotFoundException);
  });

  it('salva primeiro lançamento, chama fn_validar_resultado_desafio e audita INSERTs com mesmo operacaoId', async () => {
    const { prisma, tx, audit } = createMocks();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });
    tx.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    tx.resultadoDesafio.findMany.mockResolvedValue([]);
    tx.resultadoDesafio.create
      .mockResolvedValueOnce({
        id: 12,
        grupoId: 2,
        colocacao: null,
        ausente: true,
      })
      .mockResolvedValueOnce({
        id: 11,
        grupoId: 1,
        colocacao: 1,
        ausente: false,
      });

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditoriaService,
    );
    const saved = await service.save(7, 1, 3, [
      { grupoId: 2, colocacao: null, ausente: true },
      { grupoId: 1, colocacao: 1, ausente: false },
    ]);

    expect(saved).toEqual([
      { id: 11, grupoId: 1, colocacao: 1, ausente: false, pontos: 100 },
      { id: 12, grupoId: 2, colocacao: null, ausente: true, pontos: 0 },
    ]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
    const firstCall = audit.record.mock.calls[0]?.[1];
    const secondCall = audit.record.mock.calls[1]?.[1];
    expect(firstCall.operacaoId).toBe(secondCall.operacaoId);
    expect(firstCall).toMatchObject({
      usuarioId: 7,
      eventoId: 1,
      entidade: 'RESULTADO_DESAFIO',
      operacao: 'INSERT',
      afetaResultado: true,
    });
  });

  it('troca colocações em duas etapas preservando IDs e auditando apenas estado original/final', async () => {
    const { prisma, tx, audit } = createMocks();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });
    tx.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    tx.resultadoDesafio.findMany.mockResolvedValue([
      { id: 11, grupoId: 1, colocacao: 1, ausente: false },
      { id: 12, grupoId: 2, colocacao: 2, ausente: false },
    ]);
    tx.resultadoDesafio.update
      .mockResolvedValueOnce({
        id: 11,
        grupoId: 1,
        colocacao: 2,
        ausente: false,
      })
      .mockResolvedValueOnce({
        id: 12,
        grupoId: 2,
        colocacao: 1,
        ausente: false,
      });

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditoriaService,
    );
    const saved = await service.save(7, 1, 3, [
      { grupoId: 1, colocacao: 2, ausente: false },
      { grupoId: 2, colocacao: 1, ausente: false },
    ]);

    expect(tx.resultadoDesafio.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [11, 12] } },
      data: { ausente: true, colocacao: null },
    });
    expect(saved).toEqual([
      { id: 11, grupoId: 1, colocacao: 2, ausente: false, pontos: 80 },
      { id: 12, grupoId: 2, colocacao: 1, ausente: false, pontos: 100 },
    ]);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record.mock.calls[0]?.[1]).toMatchObject({
      registroId: 11,
      operacao: 'UPDATE',
      before: { colocacao: 1, ausente: false },
      after: { colocacao: 2, ausente: false },
    });
  });

  it('reenvio idempotente mesmo em ordem invertida não altera nem gera auditoria', async () => {
    const { prisma, tx, audit } = createMocks();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });
    tx.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    tx.resultadoDesafio.findMany.mockResolvedValue([
      { id: 11, grupoId: 1, colocacao: 1, ausente: false },
      { id: 12, grupoId: 2, colocacao: 2, ausente: false },
    ]);

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditoriaService,
    );
    const saved = await service.save(7, 1, 3, [
      { grupoId: 2, colocacao: 2, ausente: false },
      { grupoId: 1, colocacao: 1, ausente: false },
    ]);

    expect(tx.resultadoDesafio.updateMany).not.toHaveBeenCalled();
    expect(tx.resultadoDesafio.update).not.toHaveBeenCalled();
    expect(tx.resultadoDesafio.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(saved.map((item) => item.id)).toEqual([11, 12]);
  });

  it('recusa array vazio com 400 e grupo de outro evento com 404', async () => {
    const { prisma, tx } = createMocks();
    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      {} as AuditoriaService,
    );

    await expect(service.save(7, 1, 3, [])).rejects.toThrow(
      BadRequestException,
    );

    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [{ colocacao: 1, pontos: 100 }],
    });
    tx.grupo.findMany.mockResolvedValue([{ id: 1 }]);

    await expect(
      service.save(7, 1, 3, [{ grupoId: 99, colocacao: 1, ausente: false }]),
    ).rejects.toThrow(NotFoundException);
  });

  it('recusa violações de domínio com 422 sem gravar nem auditar', async () => {
    const { prisma, tx, audit } = createMocks();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [{ colocacao: 1, pontos: 100 }],
    });
    tx.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditoriaService,
    );

    // Grupo omitido
    await expect(
      service.save(7, 1, 3, [{ grupoId: 1, colocacao: 1, ausente: false }]),
    ).rejects.toThrow(UnprocessableEntityException);

    // Grupo repetido
    await expect(
      service.save(7, 1, 3, [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 1, colocacao: 2, ausente: false },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);

    // Ausente com colocação
    await expect(
      service.save(7, 1, 3, [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: 2, ausente: true },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);

    // Presente sem colocação
    await expect(
      service.save(7, 1, 3, [
        { grupoId: 1, colocacao: null, ausente: false },
        { grupoId: 2, colocacao: null, ausente: true },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);

    // Dois presentes na mesma colocação
    await expect(
      service.save(7, 1, 3, [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: 1, ausente: false },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);

    // Lacuna na sequência 1..P (presente em 2º com o outro ausente)
    await expect(
      service.save(7, 1, 3, [
        { grupoId: 1, colocacao: 2, ausente: false },
        { grupoId: 2, colocacao: null, ausente: true },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);

    // Falta de pontuação configurada para 2º lugar
    await expect(
      service.save(7, 1, 3, [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: 2, ausente: false },
      ]),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(tx.resultadoDesafio.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('mapeia erro da fn_validar_resultado_desafio para 422 sem expor SQL', async () => {
    const { prisma, tx, audit } = createMocks();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      pontosColocacao: [{ colocacao: 1, pontos: 100 }],
    });
    tx.grupo.findMany.mockResolvedValue([{ id: 1 }]);
    tx.resultadoDesafio.findMany.mockResolvedValue([]);
    tx.resultadoDesafio.create.mockResolvedValue({
      id: 11,
      grupoId: 1,
      colocacao: 1,
      ausente: false,
    });
    tx.$executeRaw.mockRejectedValueOnce(
      Object.assign(new Error('SQL check_violation internal details'), {
        code: 'P2010',
        meta: { code: '23514' },
      }),
    );

    const service = new ResultadosService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditoriaService,
    );

    await expect(
      service.save(7, 1, 3, [{ grupoId: 1, colocacao: 1, ausente: false }]),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'Conjunto de colocações inválido para as regras do desafio.',
      ),
    );
    expect(audit.record).not.toHaveBeenCalled();

    tx.$executeRaw.mockRejectedValueOnce(new Error('driver failure'));
    await expect(
      service.save(7, 1, 3, [{ grupoId: 1, colocacao: 1, ausente: false }]),
    ).rejects.toThrow('driver failure');
  });
});
