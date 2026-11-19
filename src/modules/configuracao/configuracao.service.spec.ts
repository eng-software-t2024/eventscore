import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TipoCriterioDesempate } from '../../common/enums/tipo-criterio-desempate.enum.js';
import { ConfiguracaoService } from './configuracao.service.js';
import type { ConfiguracaoEventoDto } from './dto/configuracao-evento.dto.js';

const EVENTO_ID = 5;

function configuracao(
  extra: Partial<ConfiguracaoEventoDto> = {},
): ConfiguracaoEventoDto {
  return {
    conversaoPontoExtra: [
      { colocacao: 1, pontoExtra: 1 },
      { colocacao: 2, pontoExtra: 0.8 },
    ],
    itensBonificacao: [
      { id: 1, nome: 'Uniformização', teto: 10 },
      { nome: 'Grito de guerra', teto: 10 },
    ],
    penalidadeMin: 10,
    penalidadeMax: 50,
    fatoresPresenca: [
      { diasPresentes: 0, fator: 0 },
      { diasPresentes: 1, fator: 0.5 },
      { diasPresentes: 2, fator: 1 },
    ],
    criteriosDesempate: [
      {
        ordem: 1,
        tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        desafioId: 30,
        descricao: 'Maior pontuação na Maratona',
      },
      {
        ordem: 2,
        tipo: TipoCriterioDesempate.MAIOR_BONIFICACAO,
        desafioId: null,
        descricao: 'Maior bonificação',
      },
    ],
    ...extra,
  };
}

function setup() {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ quantidade_dias: 2 }]),
    evento: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    grupo: { count: vi.fn().mockResolvedValue(2) },
    desafio: {
      findMany: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            (where.id.in as number[]).map((id: number) => ({ id })),
          ),
        ),
    },
    penalidade: {
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: 0 },
        _min: { pontos: null },
        _max: { pontos: null },
      }),
    },
    conversaoPontoExtra: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    fatorPresenca: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    itemBonificacao: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 1, nome: 'Uniformização', teto: 10 }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    bonificacaoGrupo: {
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    criterioDesempate: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    apuracaoCriterio: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn((fn: (tx: typeof db) => unknown) => fn(db)),
  };
  const service = new ConfiguracaoService(prisma as never);
  return { service, db, prisma };
}

async function esperar422(promessa: Promise<unknown>, trecho: string) {
  await expect(promessa).rejects.toBeInstanceOf(UnprocessableEntityException);
  await expect(promessa).rejects.toThrow(trecho);
}

describe('ConfiguracaoService', () => {
  describe('obter', () => {
    it('retorna 404 para evento inexistente', async () => {
      const { service, db } = setup();
      db.evento.findUnique.mockResolvedValue(null);

      await expect(service.obter(EVENTO_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('devolve evento sem configuração com listas vazias e faixa nula', async () => {
      const { service, db } = setup();
      db.evento.findUnique.mockResolvedValue({
        penalidadeMin: null,
        penalidadeMax: null,
      });
      db.itemBonificacao.findMany.mockResolvedValue([]);

      await expect(service.obter(EVENTO_ID)).resolves.toEqual({
        conversaoPontoExtra: [],
        itensBonificacao: [],
        penalidadeMin: null,
        penalidadeMax: null,
        fatoresPresenca: [],
        criteriosDesempate: [],
      });
    });

    it('converte os decimais do banco em número e ordena pelo contrato', async () => {
      const { service, db } = setup();
      db.evento.findUnique.mockResolvedValue({
        penalidadeMin: 10,
        penalidadeMax: 50,
      });
      // O Prisma devolve Decimal; Number() aceita o objeto e a string.
      db.conversaoPontoExtra.findMany.mockResolvedValue([
        { colocacao: 1, pontoExtra: '1.0' },
      ]);
      db.fatorPresenca.findMany.mockResolvedValue([
        { diasPresentes: 1, fator: '0.5000' },
      ]);
      db.criterioDesempate.findMany.mockResolvedValue([
        {
          id: 9,
          ordem: 1,
          tipo: 'MENOR_PENALIDADE',
          desafioId: null,
          descricao: 'Menor penalidade',
        },
      ]);

      const resultado = await service.obter(EVENTO_ID);

      expect(resultado).toEqual({
        conversaoPontoExtra: [{ colocacao: 1, pontoExtra: 1 }],
        itensBonificacao: [{ id: 1, nome: 'Uniformização', teto: 10 }],
        penalidadeMin: 10,
        penalidadeMax: 50,
        fatoresPresenca: [{ diasPresentes: 1, fator: 0.5 }],
        criteriosDesempate: [
          {
            ordem: 1,
            tipo: 'MENOR_PENALIDADE',
            desafioId: null,
            descricao: 'Menor penalidade',
          },
        ],
      });
      expect(db.conversaoPontoExtra.findMany).toHaveBeenCalledWith({
        where: { eventoId: EVENTO_ID },
        orderBy: { colocacao: 'asc' },
      });
      expect(db.criterioDesempate.findMany).toHaveBeenCalledWith({
        where: { eventoId: EVENTO_ID },
        orderBy: { ordem: 'asc' },
      });
    });
  });

  describe('salvar: validações', () => {
    it('retorna 404 para evento inexistente', async () => {
      const { service, db } = setup();
      db.$queryRaw.mockResolvedValue([]);

      await expect(
        service.salvar(EVENTO_ID, configuracao()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('exige uma linha de ponto extra por grupo (art. 17)', async () => {
      const { service, db } = setup();
      db.grupo.count.mockResolvedValue(3);

      await esperar422(
        service.salvar(EVENTO_ID, configuracao()),
        'uma linha para cada um dos 3 grupos',
      );
    });

    it('exige colocações de 1 a N sem lacuna nem repetição', async () => {
      const { service } = setup();

      for (const colocacoes of [
        [1, 3],
        [2, 2],
      ]) {
        await esperar422(
          service.salvar(
            EVENTO_ID,
            configuracao({
              conversaoPontoExtra: colocacoes.map((colocacao) => ({
                colocacao,
                pontoExtra: 0.5,
              })),
            }),
          ),
          'devem ir de 1 a 2',
        );
      }
    });

    it('aceita evento sem grupos com tabela de ponto extra vazia', async () => {
      const { service, db } = setup();
      db.grupo.count.mockResolvedValue(0);

      await expect(
        service.salvar(EVENTO_ID, configuracao({ conversaoPontoExtra: [] })),
      ).resolves.toBeDefined();
    });

    it.each([
      ['incompleta', [0, 1]],
      ['acima da quantidade de dias', [0, 1, 2, 3]],
      ['repetida', [0, 1, 1]],
      ['vazia', []],
    ])('exige fatores de 0 a quantidadeDias (lista %s)', async (_, dias) => {
      const { service } = setup();

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({
            fatoresPresenca: dias.map((diasPresentes) => ({
              diasPresentes,
              fator: 1,
            })),
          }),
        ),
        'de 0 a 2',
      );
    });

    it('exige a faixa de penalidade completa ou vazia', async () => {
      const { service } = setup();

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({ penalidadeMin: 10, penalidadeMax: null }),
        ),
        'ou deixe as duas em branco',
      );
    });

    it('recusa penalidade mínima maior que a máxima', async () => {
      const { service } = setup();

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({ penalidadeMin: 60, penalidadeMax: 50 }),
        ),
        'não pode ser maior que a máxima',
      );
    });

    it('exige ordem dos critérios de 1 a N', async () => {
      const { service } = setup();
      const dto = configuracao();
      dto.criteriosDesempate[1].ordem = 3;

      await esperar422(
        service.salvar(EVENTO_ID, dto),
        'A ordem dos critérios de desempate deve ir de 1 a 2',
      );
    });

    it('exige desafio em MAIOR_PONTUACAO_DESAFIO', async () => {
      const { service } = setup();
      const dto = configuracao();
      dto.criteriosDesempate[0].desafioId = null;

      await esperar422(
        service.salvar(EVENTO_ID, dto),
        'Escolha o desafio do 1º critério',
      );
    });

    it('recusa desafio nos demais tipos', async () => {
      const { service } = setup();
      const dto = configuracao();
      dto.criteriosDesempate[1].desafioId = 30;

      await esperar422(service.salvar(EVENTO_ID, dto), 'não usa desafio');
    });

    it.each([
      [
        'o mesmo desafio duas vezes',
        TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        30,
      ],
      ['outro tipo repetido', TipoCriterioDesempate.MAIOR_BONIFICACAO, null],
    ])('recusa critério duplicado: %s', async (_, tipo, desafioId) => {
      const { service } = setup();
      const dto = configuracao();
      dto.criteriosDesempate.push({
        ordem: 3,
        tipo,
        desafioId,
        descricao: 'Repetido',
      });

      await esperar422(
        service.salvar(EVENTO_ID, dto),
        'repete um critério anterior',
      );
    });

    it('aceita vários critérios por desafio, como no art. 16', async () => {
      const { service, db } = setup();
      const porDesafio = [30, 31, 32, 33].map((desafioId, i) => ({
        ordem: i + 1,
        tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        desafioId,
        descricao: `Desafio ${desafioId}`,
      }));

      await service.salvar(
        EVENTO_ID,
        configuracao({
          criteriosDesempate: [
            ...porDesafio,
            {
              ordem: 5,
              tipo: TipoCriterioDesempate.MAIOR_BONIFICACAO,
              desafioId: null,
              descricao: 'Identidade e Torcida',
            },
          ],
        }),
      );

      expect(db.criterioDesempate.create).toHaveBeenCalledTimes(5);
    });

    it('retorna 404 para desafio de outro evento', async () => {
      const { service, db } = setup();
      db.desafio.findMany.mockResolvedValue([]);

      await expect(
        service.salvar(EVENTO_ID, configuracao()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.desafio.findMany).toHaveBeenCalledWith({
        where: { eventoId: EVENTO_ID, id: { in: [30] } },
        select: { id: true },
      });
    });

    it('recusa nome de item repetido, sem diferenciar maiúsculas', async () => {
      const { service } = setup();

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({
            itensBonificacao: [
              { nome: 'Grito', teto: 10 },
              { nome: 'GRITO', teto: 5 },
            ],
          }),
        ),
        'aparece mais de uma vez',
      );
    });

    it('recusa o mesmo id de item duas vezes', async () => {
      const { service } = setup();

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({
            itensBonificacao: [
              { id: 1, nome: 'A', teto: 10 },
              { id: 1, nome: 'B', teto: 10 },
            ],
          }),
        ),
        'aparece mais de uma vez',
      );
    });

    it('não grava nada quando a validação falha', async () => {
      const { service, db } = setup();
      db.grupo.count.mockResolvedValue(3);

      await expect(
        service.salvar(EVENTO_ID, configuracao()),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(db.evento.update).not.toHaveBeenCalled();
      expect(db.conversaoPontoExtra.upsert).not.toHaveBeenCalled();
    });
  });

  describe('salvar: penalidades já lançadas', () => {
    const lancadas = (min: number, max: number) => ({
      _count: { _all: 2 },
      _min: { pontos: min },
      _max: { pontos: max },
    });

    it('recusa limpar a faixa com penalidade lançada', async () => {
      const { service, db } = setup();
      db.penalidade.aggregate.mockResolvedValue(lancadas(20, 30));

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({ penalidadeMin: null, penalidadeMax: null }),
        ),
        'Não é possível remover a faixa',
      );
    });

    it('recusa faixa que deixa penalidade lançada de fora', async () => {
      const { service, db } = setup();
      db.penalidade.aggregate.mockResolvedValue(lancadas(10, 40));

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({ penalidadeMin: 15, penalidadeMax: 50 }),
        ),
        'de 10 a 40 pontos',
      );
      expect(db.penalidade.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { grupo: { eventoId: EVENTO_ID } } }),
      );
    });

    it('aceita faixa que cobre as penalidades lançadas', async () => {
      const { service, db } = setup();
      db.penalidade.aggregate.mockResolvedValue(lancadas(10, 40));

      await expect(
        service.salvar(
          EVENTO_ID,
          configuracao({ penalidadeMin: 10, penalidadeMax: 40 }),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('salvar: itens de bonificação', () => {
    it('retorna 404 para item de outro evento', async () => {
      const { service } = setup();

      await expect(
        service.salvar(
          EVENTO_ID,
          configuracao({
            itensBonificacao: [{ id: 99, nome: 'Outro', teto: 10 }],
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa remover item com bonificação lançada (409)', async () => {
      const { service, db } = setup();
      db.bonificacaoGrupo.findFirst.mockResolvedValue({
        itemBonificacaoId: 1,
      });

      const promessa = service.salvar(
        EVENTO_ID,
        configuracao({ itensBonificacao: [] }),
      );

      await expect(promessa).rejects.toBeInstanceOf(ConflictException);
      await expect(promessa).rejects.toThrow('"Uniformização"');
    });

    it('recusa teto abaixo de bonificação já lançada', async () => {
      const { service, db } = setup();
      db.bonificacaoGrupo.groupBy.mockResolvedValue([
        { itemBonificacaoId: 1, _max: { valor: 8 } },
      ]);

      await esperar422(
        service.salvar(
          EVENTO_ID,
          configuracao({
            itensBonificacao: [{ id: 1, nome: 'Uniformização', teto: 5 }],
          }),
        ),
        'não pode ficar abaixo de 8',
      );
    });

    it('aceita teto reduzido que ainda cobre o lançado', async () => {
      const { service, db } = setup();
      db.bonificacaoGrupo.groupBy.mockResolvedValue([
        { itemBonificacaoId: 1, _max: { valor: 5 } },
      ]);

      await service.salvar(
        EVENTO_ID,
        configuracao({
          itensBonificacao: [{ id: 1, nome: 'Uniformização', teto: 5 }],
        }),
      );

      expect(db.itemBonificacao.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { nome: 'Uniformização', teto: 5 },
      });
    });

    it('troca o nome de dois itens entre si em duas etapas', async () => {
      const { service, db } = setup();
      db.itemBonificacao.findMany.mockResolvedValue([
        { id: 1, nome: 'A', teto: 10 },
        { id: 2, nome: 'B', teto: 10 },
      ]);

      await service.salvar(
        EVENTO_ID,
        configuracao({
          itensBonificacao: [
            { id: 1, nome: 'B', teto: 10 },
            { id: 2, nome: 'A', teto: 10 },
          ],
        }),
      );

      const chamadas = db.itemBonificacao.update.mock.calls.map(
        ([arg]) => arg as { where: { id: number }; data: { nome: string } },
      );
      expect(chamadas).toHaveLength(4);
      expect(chamadas[0].data.nome).toMatch(/^~/);
      expect(chamadas[1].data.nome).toMatch(/^~/);
      expect(chamadas[2]).toEqual({
        where: { id: 1 },
        data: { nome: 'B', teto: 10 },
      });
      expect(chamadas[3]).toEqual({
        where: { id: 2 },
        data: { nome: 'A', teto: 10 },
      });
    });

    it('remove o que saiu da lista, mantém o igual e cria o novo', async () => {
      const { service, db } = setup();
      db.itemBonificacao.findMany.mockResolvedValue([
        { id: 1, nome: 'Uniformização', teto: 10 },
        { id: 2, nome: 'Antigo', teto: 10 },
      ]);

      await service.salvar(EVENTO_ID, configuracao());

      expect(db.itemBonificacao.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
      });
      expect(db.itemBonificacao.update).not.toHaveBeenCalled();
      expect(db.itemBonificacao.create).toHaveBeenCalledWith({
        data: { eventoId: EVENTO_ID, nome: 'Grito de guerra', teto: 10 },
      });
    });
  });

  describe('salvar: gravação', () => {
    it('grava faixa, conversão e fatores por chave e devolve o que ficou salvo', async () => {
      const { service, db } = setup();
      const dto = configuracao();

      const resultado = await service.salvar(EVENTO_ID, dto);

      expect(db.evento.update).toHaveBeenCalledWith({
        where: { id: EVENTO_ID },
        data: { penalidadeMin: 10, penalidadeMax: 50 },
      });
      expect(db.conversaoPontoExtra.deleteMany).toHaveBeenCalledWith({
        where: { eventoId: EVENTO_ID, colocacao: { notIn: [1, 2] } },
      });
      expect(db.conversaoPontoExtra.upsert).toHaveBeenCalledWith({
        where: { eventoId_colocacao: { eventoId: EVENTO_ID, colocacao: 2 } },
        create: { eventoId: EVENTO_ID, colocacao: 2, pontoExtra: 0.8 },
        update: { pontoExtra: 0.8 },
      });
      expect(db.fatorPresenca.deleteMany).toHaveBeenCalledWith({
        where: { eventoId: EVENTO_ID, diasPresentes: { notIn: [0, 1, 2] } },
      });
      expect(db.fatorPresenca.upsert).toHaveBeenCalledTimes(3);
      expect(resultado.penalidadeMin).toBe(10);
      expect(resultado.penalidadeMax).toBe(50);
    });

    it('trava a linha do evento antes de gravar', async () => {
      const { service, db } = setup();

      await service.salvar(EVENTO_ID, configuracao());

      const sql = (db.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toContain('FOR UPDATE');
      expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        db.evento.update.mock.invocationCallOrder[0],
      );
    });

    describe('critérios casados por tipo + desafio, não pela posição', () => {
      const maratona = {
        id: 11,
        ordem: 1,
        tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        desafioId: 30,
        descricao: 'Maior pontuação na Maratona',
      };
      const bonificacao = {
        id: 12,
        ordem: 2,
        tipo: TipoCriterioDesempate.MAIOR_BONIFICACAO,
        desafioId: null,
        descricao: 'Maior bonificação',
      };
      const penalidade = {
        id: 13,
        ordem: 2,
        tipo: TipoCriterioDesempate.MENOR_PENALIDADE,
        desafioId: null,
        descricao: 'Menor penalidade',
      };

      it('não altera nada ao reenviar os mesmos critérios', async () => {
        const { service, db } = setup();
        db.criterioDesempate.findMany.mockResolvedValue([
          maratona,
          bonificacao,
        ]);

        await service.salvar(EVENTO_ID, configuracao());

        expect(db.criterioDesempate.update).not.toHaveBeenCalled();
        expect(db.criterioDesempate.create).not.toHaveBeenCalled();
        expect(db.criterioDesempate.deleteMany).not.toHaveBeenCalled();
      });

      it('reordena mudando só a ordem, em duas etapas, sem trocar tipo do id', async () => {
        const { service, db } = setup();
        db.criterioDesempate.findMany.mockResolvedValue([
          maratona,
          bonificacao,
        ]);
        const dto = configuracao();
        const [primeiro, segundo] = dto.criteriosDesempate;
        primeiro.ordem = 2;
        segundo.ordem = 1;
        dto.criteriosDesempate = [segundo, primeiro];

        await service.salvar(EVENTO_ID, dto);

        expect(db.criterioDesempate.update.mock.calls.map(([a]) => a)).toEqual([
          { where: { id: 12 }, data: { ordem: 3 } },
          { where: { id: 11 }, data: { ordem: 4 } },
          {
            where: { id: 12 },
            data: { ordem: 1, descricao: 'Maior bonificação' },
          },
          {
            where: { id: 11 },
            data: { ordem: 2, descricao: 'Maior pontuação na Maratona' },
          },
        ]);
        expect(db.criterioDesempate.create).not.toHaveBeenCalled();
        expect(db.criterioDesempate.deleteMany).not.toHaveBeenCalled();
      });

      it('remove só o critério que saiu da lista, mesmo no meio', async () => {
        const { service, db } = setup();
        db.criterioDesempate.findMany.mockResolvedValue([
          maratona,
          penalidade,
          { ...bonificacao, ordem: 3 },
        ]);

        await service.salvar(EVENTO_ID, configuracao());

        expect(db.apuracaoCriterio.findFirst).toHaveBeenCalledWith({
          where: { criterioDesempateId: { in: [13] } },
          select: { criterioDesempateId: true },
        });
        expect(db.criterioDesempate.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: [13] } },
        });
        expect(db.criterioDesempate.update.mock.calls.map(([a]) => a)).toEqual([
          { where: { id: 12 }, data: { ordem: 4 } },
          {
            where: { id: 12 },
            data: { ordem: 2, descricao: 'Maior bonificação' },
          },
        ]);
      });

      it('recusa remover critério usado em apuração (409) e nomeia o critério', async () => {
        const { service, db } = setup();
        db.criterioDesempate.findMany.mockResolvedValue([
          maratona,
          penalidade,
          { ...bonificacao, ordem: 3 },
        ]);
        db.apuracaoCriterio.findFirst.mockResolvedValue({
          criterioDesempateId: 13,
        });

        const promessa = service.salvar(EVENTO_ID, configuracao());

        await expect(promessa).rejects.toBeInstanceOf(ConflictException);
        await expect(promessa).rejects.toThrow('"Menor penalidade"');
        expect(db.criterioDesempate.deleteMany).not.toHaveBeenCalled();
      });

      it('trocar o desafio é remover um critério e criar outro', async () => {
        const { service, db } = setup();
        db.criterioDesempate.findMany.mockResolvedValue([
          maratona,
          bonificacao,
        ]);
        const dto = configuracao();
        dto.criteriosDesempate[0].desafioId = 31;
        dto.criteriosDesempate[0].descricao = 'Maior pontuação na Robótica';

        await service.salvar(EVENTO_ID, dto);

        expect(db.criterioDesempate.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: [11] } },
        });
        expect(db.criterioDesempate.create).toHaveBeenCalledWith({
          data: {
            eventoId: EVENTO_ID,
            ordem: 1,
            tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
            desafioId: 31,
            descricao: 'Maior pontuação na Robótica',
          },
        });
        expect(db.criterioDesempate.update).not.toHaveBeenCalled();
      });
    });

    it('limpa a faixa quando não há penalidade lançada', async () => {
      const { service, db } = setup();

      await service.salvar(
        EVENTO_ID,
        configuracao({ penalidadeMin: null, penalidadeMax: null }),
      );

      expect(db.evento.update).toHaveBeenCalledWith({
        where: { id: EVENTO_ID },
        data: { penalidadeMin: null, penalidadeMax: null },
      });
    });
  });
});
