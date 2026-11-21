import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ClassificacaoService } from '../classificacao/classificacao.service.js';
import { ApuracaoService } from './apuracao.service.js';

function mocks() {
  const prisma = {
    evento: { findUnique: vi.fn() },
    grupo: { findMany: vi.fn() },
    desafio: { findMany: vi.fn() },
    participante: { findMany: vi.fn() },
    diaEvento: { count: vi.fn() },
    conversaoPontoExtra: { findMany: vi.fn() },
    fatorPresenca: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const classificacao = { consultar: vi.fn() };
  classificacao.consultar.mockResolvedValue({
    dados: [
      { grupoId: 1, posicao: 1 },
      { grupoId: 2, posicao: 2 },
    ],
    resumo: { empatesPendentes: [] },
  });
  prisma.evento.findUnique.mockResolvedValue({ quantidadeDias: 2 });
  prisma.grupo.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  prisma.desafio.findMany.mockResolvedValue([
    {
      resultados: [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: 2, ausente: false },
      ],
    },
  ]);
  prisma.fatorPresenca.findMany.mockResolvedValue([
    { diasPresentes: 0 },
    { diasPresentes: 1 },
    { diasPresentes: 2 },
  ]);
  prisma.participante.findMany.mockResolvedValue([
    {
      id: 1,
      matricula: '001',
      nome: 'Ana',
      turma: 'A1',
      grupoId: 1,
      grupo: { nome: 'Azul' },
    },
    {
      id: 2,
      matricula: '002',
      nome: 'Bia',
      turma: 'A1',
      grupoId: 2,
      grupo: { nome: 'Verde' },
    },
  ]);
  prisma.diaEvento.count.mockResolvedValue(2);
  prisma.conversaoPontoExtra.findMany.mockResolvedValue([
    { colocacao: 1, pontoExtra: new Prisma.Decimal('1.0') },
    { colocacao: 2, pontoExtra: new Prisma.Decimal('0.8') },
  ]);
  prisma.$queryRaw.mockResolvedValue([
    { participanteId: 1, diasPresentes: 2n, fator: new Prisma.Decimal(1) },
    { participanteId: 2, diasPresentes: 1n, fator: new Prisma.Decimal('0.5') },
  ]);
  const service = new ApuracaoService(
    prisma as unknown as PrismaService,
    classificacao as unknown as ClassificacaoService,
  );
  return { prisma, classificacao, service };
}

describe('ApuracaoService', () => {
  it('usa a classificação compartilhada e calcula resumo antes da paginação', async () => {
    const { prisma, classificacao, service } = mocks();
    const resposta = await service.getResults(5, { pagina: 2, tamanho: 1 });
    expect(classificacao.consultar).toHaveBeenCalledWith(5);
    expect(resposta.dados).toHaveLength(1);
    expect(resposta.dados[0]).toMatchObject({
      participanteId: 2,
      pontoExtra: 0.4,
    });
    expect(resposta.paginacao).toEqual({
      pagina: 2,
      tamanho: 1,
      totalItens: 2,
      totalPaginas: 2,
    });
    expect(resposta.resumo).toEqual({
      totalParticipantes: 2,
      assiduidade: 0.75,
      aptos: 2,
    });
    expect(prisma.diaEvento.count).toHaveBeenCalledWith({
      where: { eventoId: 5 },
    });
  });

  it('aplica filtros de grupo, turma e busca antes do cálculo', async () => {
    const { prisma, service } = mocks();
    await service.getResults(5, {
      pagina: 1,
      tamanho: 20,
      grupoId: 2,
      turma: 'A1',
      busca: '  bia  ',
    });
    expect(prisma.participante.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventoId: 5,
          grupoId: 2,
          turma: 'A1',
          OR: [
            { nome: { contains: 'bia', mode: 'insensitive' } },
            { matricula: { contains: 'bia', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('bloqueia empate pendente antes de consultar participantes', async () => {
    const { classificacao, prisma, service } = mocks();
    classificacao.consultar.mockResolvedValue({
      dados: [],
      resumo: { empatesPendentes: [[1, 2]] },
    });
    await expect(
      service.getResults(5, { pagina: 1, tamanho: 20 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.participante.findMany).not.toHaveBeenCalled();
  });

  it('preserva 404 de evento inexistente', async () => {
    const { classificacao, service } = mocks();
    classificacao.consultar.mockRejectedValue(
      new NotFoundException('Evento não encontrado'),
    );
    await expect(
      service.getResults(99, { pagina: 1, tamanho: 20 }),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([
    [
      'sem grupos',
      'grupo',
      (prisma: ReturnType<typeof mocks>['prisma']) =>
        prisma.grupo.findMany.mockResolvedValue([]),
    ],
    [
      'sem desafios',
      'desafio',
      (prisma: ReturnType<typeof mocks>['prisma']) =>
        prisma.desafio.findMany.mockResolvedValue([]),
    ],
    [
      'resultado ausente',
      'resultados pendentes',
      (prisma: ReturnType<typeof mocks>['prisma']) =>
        prisma.desafio.findMany.mockResolvedValue([
          { resultados: [{ grupoId: 1, colocacao: 1, ausente: false }] },
        ]),
    ],
  ])(
    'recusa evento %s antes de consultar participantes',
    async (_case, message, change) => {
      const { prisma, service } = mocks();
      change(prisma);
      await expect(
        service.getResults(5, { pagina: 1, tamanho: 20 }),
      ).rejects.toThrow(message);
      expect(prisma.participante.findMany).not.toHaveBeenCalled();
    },
  );

  it('recusa conversão incompleta com 409', async () => {
    const { prisma, service } = mocks();
    prisma.conversaoPontoExtra.findMany.mockResolvedValue([
      { colocacao: 1, pontoExtra: new Prisma.Decimal(1) },
    ]);
    await expect(
      service.getResults(5, { pagina: 1, tamanho: 20 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.participante.findMany).not.toHaveBeenCalled();
  });

  it('recusa fator ausente inclusive para zero dias', async () => {
    const { prisma, service } = mocks();
    prisma.fatorPresenca.findMany.mockResolvedValue([
      { diasPresentes: 1 },
      { diasPresentes: 2 },
    ]);
    await expect(
      service.getResults(5, { pagina: 1, tamanho: 20 }),
    ).rejects.toThrow('Falta o fator para 0 dias presentes');
    expect(prisma.participante.findMany).not.toHaveBeenCalled();
  });
});
