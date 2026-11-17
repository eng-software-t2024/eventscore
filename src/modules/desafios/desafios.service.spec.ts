import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { DesafiosService } from './desafios.service.js';

function createPrismaMock() {
  const tx = {
    evento: { findUnique: vi.fn() },
    diaEvento: { findUnique: vi.fn() },
    grupo: { count: vi.fn() },
    desafio: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pontosColocacao: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    resultadoDesafio: { count: vi.fn() },
    criterioDesempate: { count: vi.fn() },
  };

  const prisma = {
    evento: { findUnique: vi.fn() },
    desafio: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return { prisma, tx };
}

describe('DesafiosService', () => {
  it('lista desafios do evento convertendo descrição null para string vazia', async () => {
    const { prisma } = createPrismaMock();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.desafio.findMany.mockResolvedValue([
      {
        id: 3,
        nome: 'Hackathon',
        descricao: null,
        diaId: 2,
        pontosColocacao: [
          { colocacao: 2, pontos: 80 },
          { colocacao: 1, pontos: 100 },
        ],
      },
    ]);

    const service = new DesafiosService(prisma as unknown as PrismaService);
    const result = await service.list(1);

    expect(prisma.desafio.findMany).toHaveBeenCalledWith({
      where: { eventoId: 1 },
      orderBy: [{ dia: { numeroDia: 'asc' } }, { id: 'asc' }],
      include: {
        pontosColocacao: {
          orderBy: { colocacao: 'asc' },
          select: { colocacao: true, pontos: true },
        },
      },
    });
    expect(result).toEqual([
      {
        id: 3,
        nome: 'Hackathon',
        descricao: '',
        diaId: 2,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      },
    ]);
  });

  it('retorna array vazio ao listar desafios de evento existente sem desafios', async () => {
    const { prisma } = createPrismaMock();
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });
    prisma.desafio.findMany.mockResolvedValue([]);

    const service = new DesafiosService(prisma as unknown as PrismaService);

    await expect(service.list(1)).resolves.toEqual([]);
  });

  it('lança 404 ao listar ou consultar desafio de evento inexistente', async () => {
    const { prisma } = createPrismaMock();
    prisma.evento.findUnique.mockResolvedValue(null);
    prisma.desafio.findUnique.mockResolvedValue(null);

    const service = new DesafiosService(prisma as unknown as PrismaService);

    await expect(service.list(99)).rejects.toThrow(NotFoundException);
    await expect(service.findById(99, 3)).rejects.toThrow(NotFoundException);
  });

  it('lança 404 ao consultar desafio de outro evento', async () => {
    const { prisma } = createPrismaMock();
    prisma.desafio.findUnique.mockResolvedValue(null);
    prisma.evento.findUnique.mockResolvedValue({ id: 1 });

    const service = new DesafiosService(prisma as unknown as PrismaService);

    await expect(service.findById(1, 3)).rejects.toThrow(NotFoundException);
    expect(prisma.desafio.findUnique).toHaveBeenCalledWith({
      where: { id_eventoId: { id: 3, eventoId: 1 } },
      include: {
        pontosColocacao: {
          orderBy: { colocacao: 'asc' },
          select: { colocacao: true, pontos: true },
        },
      },
    });
  });

  it('cria desafio e tabela de pontos ordenada na mesma transação com trim e descrição padrão', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.evento.findUnique.mockResolvedValue({ id: 1 });
    tx.diaEvento.findUnique.mockResolvedValue({ id: 2 });
    tx.grupo.count.mockResolvedValue(2);
    tx.desafio.findUnique.mockResolvedValue(null);
    tx.desafio.create.mockResolvedValue({
      id: 10,
      nome: 'Hackathon',
      descricao: '',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });

    const service = new DesafiosService(prisma as unknown as PrismaService);
    const result = await service.create(1, {
      nome: '  Hackathon  ',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 2, pontos: 80 },
        { colocacao: 1, pontos: 100 },
      ],
    });

    expect(tx.desafio.create).toHaveBeenCalledWith({
      data: {
        eventoId: 1,
        diaId: 2,
        nome: 'Hackathon',
        descricao: '',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        },
      },
      include: {
        pontosColocacao: {
          orderBy: { colocacao: 'asc' },
          select: { colocacao: true, pontos: true },
        },
      },
    });
    expect(result.id).toBe(10);
  });

  it('recusa criação com 404 se dia não pertencer ao evento', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.evento.findUnique.mockResolvedValue({ id: 1 });
    tx.diaEvento.findUnique.mockResolvedValue(null);

    const service = new DesafiosService(prisma as unknown as PrismaService);

    await expect(
      service.create(1, {
        nome: 'Hackathon',
        diaId: 99,
        pontosColocacao: [{ colocacao: 1, pontos: 100 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('recusa criação com 422 quando evento não tem grupos, quantidade diverge ou colocações repetem/têm lacunas', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.evento.findUnique.mockResolvedValue({ id: 1 });
    tx.diaEvento.findUnique.mockResolvedValue({ id: 2 });

    const service = new DesafiosService(prisma as unknown as PrismaService);

    tx.grupo.count.mockResolvedValue(0);
    await expect(
      service.create(1, {
        nome: 'Hackathon',
        diaId: 2,
        pontosColocacao: [{ colocacao: 1, pontos: 100 }],
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    tx.grupo.count.mockResolvedValue(3);
    await expect(
      service.create(1, {
        nome: 'Hackathon',
        diaId: 2,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    tx.grupo.count.mockResolvedValue(2);
    await expect(
      service.create(1, {
        nome: 'Hackathon',
        diaId: 2,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 1, pontos: 80 },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.create(1, {
        nome: 'Hackathon',
        diaId: 2,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 3, pontos: 80 },
        ],
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('recusa criação com 409 quando nome já existe no mesmo dia e evento', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.evento.findUnique.mockResolvedValue({ id: 1 });
    tx.diaEvento.findUnique.mockResolvedValue({ id: 2 });
    tx.grupo.count.mockResolvedValue(1);
    tx.desafio.findUnique.mockResolvedValue({ id: 5 });

    const service = new DesafiosService(prisma as unknown as PrismaService);

    await expect(
      service.create(1, {
        nome: 'Hackathon',
        diaId: 2,
        pontosColocacao: [{ colocacao: 1, pontos: 100 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('permite atualizar nome/descrição após resultados mesmo reenviando mesmo diaId e mesma tabela fora de ordem', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.desafio.findUnique
      .mockResolvedValueOnce({
        id: 3,
        nome: 'Hackathon',
        descricao: 'Antiga',
        diaId: 2,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      })
      .mockResolvedValueOnce(null);
    tx.resultadoDesafio.count.mockResolvedValue(2);
    tx.desafio.update.mockResolvedValue({
      id: 3,
      nome: 'Hackathon final',
      descricao: '',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });

    const service = new DesafiosService(prisma as unknown as PrismaService);
    const result = await service.update(1, 3, {
      nome: '  Hackathon final  ',
      descricao: '',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 2, pontos: 80 },
        { colocacao: 1, pontos: 100 },
      ],
    });

    expect(tx.pontosColocacao.deleteMany).not.toHaveBeenCalled();
    expect(tx.pontosColocacao.createMany).not.toHaveBeenCalled();
    expect(tx.desafio.update).toHaveBeenCalledWith({
      where: { id_eventoId: { id: 3, eventoId: 1 } },
      data: {
        nome: 'Hackathon final',
        descricao: '',
        diaId: 2,
      },
      include: {
        pontosColocacao: {
          orderBy: { colocacao: 'asc' },
          select: { colocacao: true, pontos: true },
        },
      },
    });
    expect(result.nome).toBe('Hackathon final');
    expect(result.descricao).toBe('');
  });

  it('recusa com 409 mudança efetiva de diaId ou de pontuação após resultados', async () => {
    const { prisma, tx } = createPrismaMock();
    const existing = {
      id: 3,
      nome: 'Hackathon',
      descricao: '',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    };
    tx.desafio.findUnique.mockResolvedValue(existing);
    tx.diaEvento.findUnique.mockResolvedValue({ id: 3 });
    tx.resultadoDesafio.count.mockResolvedValue(1);

    const service = new DesafiosService(prisma as unknown as PrismaService);

    await expect(service.update(1, 3, { diaId: 3 })).rejects.toThrow(
      ConflictException,
    );
    await expect(
      service.update(1, 3, {
        pontosColocacao: [
          { colocacao: 1, pontos: 101 },
          { colocacao: 2, pontos: 80 },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('substitui a tabela inteira antes dos resultados quando conteúdo muda e revalida tabela se total de grupos mudou', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      nome: 'Hackathon',
      descricao: '',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });
    tx.resultadoDesafio.count.mockResolvedValue(0);
    tx.grupo.count.mockResolvedValue(3);

    const service = new DesafiosService(prisma as unknown as PrismaService);

    // Total de grupos mudou para 3 antes de lançar resultados: editar nome sem atualizar tabela falha com 422
    await expect(service.update(1, 3, { nome: 'Novo' })).rejects.toThrow(
      UnprocessableEntityException,
    );

    // Agora envia nova tabela com 3 colocações: substitui toda a tabela
    tx.grupo.count.mockResolvedValue(3);
    tx.desafio.update.mockResolvedValue({
      id: 3,
      nome: 'Hackathon',
      descricao: '',
      diaId: 2,
      pontosColocacao: [
        { colocacao: 1, pontos: 120 },
        { colocacao: 2, pontos: 90 },
        { colocacao: 3, pontos: 60 },
      ],
    });

    const updated = await service.update(1, 3, {
      pontosColocacao: [
        { colocacao: 3, pontos: 60 },
        { colocacao: 1, pontos: 120 },
        { colocacao: 2, pontos: 90 },
      ],
    });

    expect(tx.pontosColocacao.deleteMany).toHaveBeenCalledWith({
      where: { desafioId: 3 },
    });
    expect(tx.pontosColocacao.createMany).toHaveBeenCalledWith({
      data: [
        { desafioId: 3, colocacao: 1, pontos: 120 },
        { desafioId: 3, colocacao: 2, pontos: 90 },
        { desafioId: 3, colocacao: 3, pontos: 60 },
      ],
    });
    expect(updated.pontosColocacao).toHaveLength(3);
  });

  it('exclui pontos e desafio na mesma transação quando não há vínculos', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      nome: 'Hackathon',
      descricao: '',
      diaId: 2,
      pontosColocacao: [],
    });
    tx.criterioDesempate.count.mockResolvedValue(0);
    tx.resultadoDesafio.count.mockResolvedValue(0);

    const service = new DesafiosService(prisma as unknown as PrismaService);
    await service.remove(1, 3);

    expect(tx.pontosColocacao.deleteMany).toHaveBeenCalledWith({
      where: { desafioId: 3 },
    });
    expect(tx.desafio.delete).toHaveBeenCalledWith({
      where: { id_eventoId: { id: 3, eventoId: 1 } },
    });
  });

  it('recusa exclusão com 409 quando desafio está em critério de desempate ou possui resultado', async () => {
    const { prisma, tx } = createPrismaMock();
    tx.desafio.findUnique.mockResolvedValue({
      id: 3,
      nome: 'Hackathon',
      descricao: '',
      diaId: 2,
      pontosColocacao: [],
    });

    const service = new DesafiosService(prisma as unknown as PrismaService);

    tx.criterioDesempate.count.mockResolvedValue(1);
    await expect(service.remove(1, 3)).rejects.toThrow(ConflictException);
    expect(tx.desafio.delete).not.toHaveBeenCalled();

    tx.criterioDesempate.count.mockResolvedValue(0);
    tx.resultadoDesafio.count.mockResolvedValue(1);
    await expect(service.remove(1, 3)).rejects.toThrow(ConflictException);
    expect(tx.desafio.delete).not.toHaveBeenCalled();
  });
});
