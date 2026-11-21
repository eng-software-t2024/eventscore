import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ClassificacaoService } from './classificacao.service.js';

describe('ClassificacaoService', () => {
  const tx = {
    $queryRaw: vi.fn(),
    grupo: { findMany: vi.fn() },
    desafio: { findMany: vi.fn() },
    bonificacaoGrupo: { findMany: vi.fn() },
    penalidade: { findMany: vi.fn() },
    criterioDesempate: { findMany: vi.fn() },
    desempateManual: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    classificacaoGrupo: { findMany: vi.fn(), createMany: vi.fn() },
    apuracao: { aggregate: vi.fn(), create: vi.fn() },
    usuario: { findUniqueOrThrow: vi.fn() },
  };
  const prisma = {
    ...tx,
    evento: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: vi.fn() };
  let service: ClassificacaoService;

  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id_evento: 1 }]);
    // Alfa 30, Beta e Gama 20, Delta e Épsilon 10: dois empates pendentes.
    tx.grupo.findMany.mockResolvedValue([
      { id: 1, nome: 'Alfa', cor: '#111111' },
      { id: 2, nome: 'Beta', cor: '#222222' },
      { id: 3, nome: 'Gama', cor: '#333333' },
      { id: 4, nome: 'Delta', cor: '#444444' },
      { id: 5, nome: 'Épsilon', cor: '#555555' },
    ]);
    tx.bonificacaoGrupo.findMany.mockResolvedValue([
      { grupoId: 1, valor: 30 },
      { grupoId: 2, valor: 20 },
      { grupoId: 3, valor: 20 },
      { grupoId: 4, valor: 10 },
      { grupoId: 5, valor: 10 },
    ]);
    // Um desafio lançado, com todos ausentes: não muda os pontos.
    tx.desafio.findMany.mockResolvedValue([
      {
        id: 10,
        pontosColocacao: [],
        resultados: [1, 2, 3, 4, 5].map((grupoId) => ({
          grupoId,
          colocacao: null,
          ausente: true,
        })),
      },
    ]);
    tx.penalidade.findMany.mockResolvedValue([]);
    tx.criterioDesempate.findMany.mockResolvedValue([]);
    tx.desempateManual.findMany.mockResolvedValue([]);
    tx.classificacaoGrupo.findMany.mockResolvedValue([]);
    tx.apuracao.aggregate.mockResolvedValue({ _max: { versao: 2 } });
    tx.apuracao.create.mockResolvedValue({
      id: 9,
      versao: 3,
      status: 'PROVISORIA',
      dataHora: new Date('2026-11-24T20:10:00.123Z'),
    });
    tx.desempateManual.create
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 })
      .mockResolvedValueOnce({ id: 103 })
      .mockResolvedValueOnce({ id: 104 });
    tx.usuario.findUniqueOrThrow.mockResolvedValue({ nome: 'Admin' });

    service = new ClassificacaoService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditoriaService,
    );
  });

  it('consultar responde 404 quando o evento não existe', async () => {
    prisma.evento.findUnique.mockResolvedValueOnce(null);
    await expect(service.consultar(99)).rejects.toThrow(NotFoundException);
  });

  it('recusa o desempate enquanto houver desafio sem lançamento', async () => {
    tx.desafio.findMany.mockResolvedValueOnce([
      { id: 10, pontosColocacao: [], resultados: [] },
    ]);

    await expect(
      service.registrarDesempate(
        1,
        {
          posicoes: [
            { grupoId: 2, posicao: 2 },
            { grupoId: 3, posicao: 3 },
          ],
          justificativa: 'Sorteio',
        },
        7,
      ),
    ).rejects.toThrow(
      new UnprocessableEntityException(
        'O desempate manual só pode ser registrado depois que todos os desafios forem lançados.',
      ),
    );
    expect(tx.apuracao.create).not.toHaveBeenCalled();
  });

  it('recusa o desempate em evento sem desafios', async () => {
    tx.desafio.findMany.mockResolvedValueOnce([]);

    await expect(
      service.registrarDesempate(
        1,
        {
          posicoes: [
            { grupoId: 2, posicao: 2 },
            { grupoId: 3, posicao: 3 },
          ],
          justificativa: 'Sorteio',
        },
        7,
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('mostra o nome do grupo repetido', async () => {
    await expect(
      service.registrarDesempate(
        1,
        {
          posicoes: [
            { grupoId: 2, posicao: 2 },
            { grupoId: 2, posicao: 3 },
          ],
          justificativa: 'Sorteio',
        },
        7,
      ),
    ).rejects.toThrow('O grupo Beta aparece mais de uma vez.');
  });

  it('exige todos os empates pendentes no mesmo envio', async () => {
    const envio = service.registrarDesempate(
      1,
      {
        posicoes: [
          { grupoId: 2, posicao: 2 },
          { grupoId: 3, posicao: 3 },
        ],
        justificativa: 'Sorteio',
      },
      7,
    );

    await expect(envio).rejects.toThrow(
      new UnprocessableEntityException(
        'Resolva também o empate no 4º lugar: os empates pendentes são registrados juntos.',
      ),
    );
    expect(tx.apuracao.create).not.toHaveBeenCalled();
  });

  it('exige o empate inteiro', async () => {
    await expect(
      service.registrarDesempate(
        1,
        {
          posicoes: [
            { grupoId: 2, posicao: 2 },
            { grupoId: 4, posicao: 4 },
          ],
          justificativa: 'Sorteio',
        },
        7,
      ),
    ).rejects.toThrow('Informe todos os grupos do empate no 2º lugar.');
  });

  it('responde 404 para grupo de outro evento', async () => {
    await expect(
      service.registrarDesempate(
        1,
        {
          posicoes: [
            { grupoId: 2, posicao: 2 },
            { grupoId: 99, posicao: 3 },
          ],
          justificativa: 'Sorteio',
        },
        7,
      ),
    ).rejects.toThrow(
      new NotFoundException('Grupo não encontrado neste evento'),
    );
  });

  it('responde 404 quando o evento não existe', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(
      service.registrarDesempate(
        99,
        {
          posicoes: [
            { grupoId: 2, posicao: 2 },
            { grupoId: 3, posicao: 3 },
          ],
          justificativa: 'Sorteio',
        },
        7,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('grava os dois empates numa apuração com posições distintas', async () => {
    const resposta = await service.registrarDesempate(
      1,
      {
        posicoes: [
          { grupoId: 5, posicao: 4 },
          { grupoId: 4, posicao: 5 },
          { grupoId: 3, posicao: 2 },
          { grupoId: 2, posicao: 3 },
        ],
        justificativa: 'Sorteio',
      },
      7,
    );

    expect(tx.apuracao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ versao: 3, status: 'PROVISORIA' }),
      }),
    );
    const linhas = tx.classificacaoGrupo.createMany.mock.calls[0][0]
      .data as Array<{
      grupoId: number;
      posicao: number;
      desempateManual: boolean;
    }>;
    expect(
      linhas
        .map((l) => [l.posicao, l.grupoId, l.desempateManual])
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    ).toEqual([
      [1, 1, false],
      [2, 3, true],
      [3, 2, true],
      [4, 5, true],
      [5, 4, true],
    ]);
    expect(tx.desempateManual.create).toHaveBeenCalledTimes(4);
    expect(audit.record).toHaveBeenCalledTimes(5);
    expect(resposta).toEqual({
      posicoes: [
        { grupoId: 3, posicao: 2 },
        { grupoId: 2, posicao: 3 },
        { grupoId: 5, posicao: 4 },
        { grupoId: 4, posicao: 5 },
      ],
      justificativa: 'Sorteio',
      responsavel: 'Admin',
      dataHora: '2026-11-24T20:10:00Z',
    });
  });
});
