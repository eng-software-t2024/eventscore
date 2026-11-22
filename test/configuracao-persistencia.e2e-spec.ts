import { limparUsuariosAuthTeste } from './helpers/limpar-usuarios-auth-teste.js';
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { TipoCriterioDesempate } from '../src/common/enums/tipo-criterio-desempate.enum.js';
import { ConfiguracaoService } from '../src/modules/configuracao/configuracao.service.js';
import type { ConfiguracaoEventoDto } from '../src/modules/configuracao/dto/configuracao-evento.dto.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PREFIXO = `T199 ${randomUUID()}`;

/** Mesma forma do DTO, mas como dado simples: o teste espalha (...) os objetos. */
type Plano<T> = T extends (infer U)[]
  ? Plano<U>[]
  : T extends object
    ? { [K in keyof T]: Plano<T[K]> }
    : T;
type Configuracao = Plano<ConfiguracaoEventoDto>;

describe('Persistência da configuração do evento (integração)', () => {
  let module: TestingModule;
  let service: ConfiguracaoService;
  let prisma: PrismaService;
  let eventoId: number;
  let outroEventoId: number;
  let grupoIds: number[];
  let desafioIds: number[];
  let desafioDeOutroEventoId: number;
  let usuarioId: number | undefined;

  async function criarEvento(sufixo: string) {
    const evento = await prisma.evento.create({
      data: {
        nome: `${PREFIXO} ${sufixo}`,
        ano: 2098,
        dataInicio: new Date('2098-05-10T00:00:00.000Z'),
        dataFim: new Date('2098-05-11T00:00:00.000Z'),
        quantidadeDias: 2,
      },
    });
    const dia = await prisma.diaEvento.create({
      data: {
        eventoId: evento.id,
        numeroDia: 1,
        data: new Date('2098-05-10T00:00:00.000Z'),
      },
    });
    return { eventoId: evento.id, diaId: dia.id };
  }

  async function limparEvento(id: number | undefined) {
    // Sem esta guarda, um beforeAll que falhou cedo deixaria id undefined, e o
    // Prisma trata `where: { eventoId: undefined }` como "sem filtro".
    if (typeof id !== 'number') {
      return;
    }
    await prisma.bonificacaoGrupo.deleteMany({
      where: { grupo: { eventoId: id } },
    });
    await prisma.penalidade.deleteMany({ where: { grupo: { eventoId: id } } });
    await prisma.apuracaoCriterio.deleteMany({
      where: { classificacaoGrupo: { eventoId: id } },
    });
    await prisma.classificacaoGrupo.deleteMany({ where: { eventoId: id } });
    await prisma.apuracao.deleteMany({ where: { eventoId: id } });
    await prisma.criterioDesempate.deleteMany({ where: { eventoId: id } });
    await prisma.desafio.deleteMany({ where: { eventoId: id } });
    await prisma.diaEvento.deleteMany({ where: { eventoId: id } });
    await prisma.itemBonificacao.deleteMany({ where: { eventoId: id } });
    await prisma.fatorPresenca.deleteMany({ where: { eventoId: id } });
    await prisma.conversaoPontoExtra.deleteMany({ where: { eventoId: id } });
    await prisma.grupo.deleteMany({ where: { eventoId: id } });
    await prisma.evento.deleteMany({ where: { id } });
  }

  const configuracaoBase = (): ConfiguracaoEventoDto => ({
    conversaoPontoExtra: [
      { colocacao: 1, pontoExtra: 1 },
      { colocacao: 2, pontoExtra: 0.8 },
    ],
    itensBonificacao: [
      { nome: 'Uniformização', teto: 10 },
      { nome: 'Grito de guerra', teto: 20 },
    ],
    penalidadeMin: 10,
    penalidadeMax: 50,
    fatoresPresenca: [
      { diasPresentes: 0, fator: 0 },
      { diasPresentes: 1, fator: 0.3333 },
      { diasPresentes: 2, fator: 1 },
    ],
    criteriosDesempate: [
      {
        ordem: 1,
        tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        desafioId: desafioIds[0],
        descricao: 'Maior pontuação na Maratona',
      },
      {
        ordem: 2,
        tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        desafioId: desafioIds[1],
        descricao: 'Maior pontuação na Robótica',
      },
      {
        ordem: 3,
        tipo: TipoCriterioDesempate.MAIOR_BONIFICACAO,
        desafioId: null,
        descricao: 'Maior bonificação',
      },
    ],
  });

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    service = module.get(ConfiguracaoService);
    prisma = module.get(PrismaService);

    const principal = await criarEvento('Evento');
    eventoId = principal.eventoId;
    const grupos = await Promise.all(
      [
        ['Alfa', '#FF5733'],
        ['Beta', '#3380FF'],
      ].map(([nome, cor]) =>
        prisma.grupo.create({ data: { eventoId, nome, cor } }),
      ),
    );
    grupoIds = grupos.map((g) => g.id);
    const desafios = await Promise.all(
      ['Maratona', 'Robótica'].map((nome) =>
        prisma.desafio.create({
          data: { eventoId, diaId: principal.diaId, nome },
        }),
      ),
    );
    desafioIds = desafios.map((d) => d.id);

    const outro = await criarEvento('Outro evento');
    outroEventoId = outro.eventoId;
    const desafioOutro = await prisma.desafio.create({
      data: { eventoId: outroEventoId, diaId: outro.diaId, nome: 'Quiz' },
    });
    desafioDeOutroEventoId = desafioOutro.id;

    const usuario = await prisma.usuario.create({
      data: {
        nome: `${PREFIXO} Admin`,
        email: `t199-${randomUUID()}@example.com`,
        senhaHash: 'hash-de-teste',
        perfil: 'ADMIN',
      },
    });
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    if (prisma) {
      await limparEvento(eventoId);
      await limparEvento(outroEventoId);
      if (typeof usuarioId === 'number') {
        await limparUsuariosAuthTeste(prisma, [usuarioId]);
      }
    }
    await module?.close();
  });

  it('devolve listas vazias e faixa nula antes da primeira configuração', async () => {
    await expect(service.obter(eventoId)).resolves.toEqual({
      conversaoPontoExtra: [],
      itensBonificacao: [],
      penalidadeMin: null,
      penalidadeMax: null,
      fatoresPresenca: [],
      criteriosDesempate: [],
    });
  });

  it('salva a configuração completa, devolve números e é idempotente', async () => {
    const salva: Configuracao = await service.salvar(
      eventoId,
      configuracaoBase(),
    );

    expect(salva.conversaoPontoExtra).toEqual([
      { colocacao: 1, pontoExtra: 1 },
      { colocacao: 2, pontoExtra: 0.8 },
    ]);
    expect(salva.fatoresPresenca[1]).toEqual({
      diasPresentes: 1,
      fator: 0.3333,
    });
    expect(salva.itensBonificacao.map((i) => i.nome)).toEqual([
      'Uniformização',
      'Grito de guerra',
    ]);
    expect(salva.criteriosDesempate).toHaveLength(3);
    await expect(service.obter(eventoId)).resolves.toEqual(salva);

    // Reenviar o que veio do GET não cria nem troca nada.
    const idsCriterios = await prisma.criterioDesempate.findMany({
      where: { eventoId },
      select: { id: true },
      orderBy: { ordem: 'asc' },
    });
    await expect(service.salvar(eventoId, salva)).resolves.toEqual(salva);
    await expect(
      prisma.criterioDesempate.findMany({
        where: { eventoId },
        select: { id: true },
        orderBy: { ordem: 'asc' },
      }),
    ).resolves.toEqual(idsCriterios);
  });

  it('troca o nome de dois itens entre si sem colidir no índice único', async () => {
    const atual: Configuracao = await service.obter(eventoId);
    const [a, b] = atual.itensBonificacao;

    const salva: Configuracao = await service.salvar(eventoId, {
      ...atual,
      itensBonificacao: [
        { ...a, nome: b.nome },
        { ...b, nome: a.nome },
      ],
    });

    expect(salva.itensBonificacao).toEqual([
      { id: a.id, nome: b.nome, teto: a.teto },
      { id: b.id, nome: a.nome, teto: b.teto },
    ]);
  });

  it('protege bonificação lançada: teto abaixo é 422 e remoção é 409', async () => {
    const atual: Configuracao = await service.obter(eventoId);
    const item = atual.itensBonificacao[0];
    await prisma.bonificacaoGrupo.create({
      data: { itemBonificacaoId: item.id!, grupoId: grupoIds[0], valor: 8 },
    });

    await expect(
      service.salvar(eventoId, {
        ...atual,
        itensBonificacao: [{ ...item, teto: 5 }, atual.itensBonificacao[1]],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.salvar(eventoId, {
        ...atual,
        itensBonificacao: [atual.itensBonificacao[1]],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(service.obter(eventoId)).resolves.toEqual(atual);
  });

  it('não deixa a faixa excluir penalidade já lançada', async () => {
    const atual: Configuracao = await service.obter(eventoId);
    await prisma.penalidade.create({
      data: { grupoId: grupoIds[1], pontos: 30, justificativa: 'Atraso' },
    });

    await expect(
      service.salvar(eventoId, {
        ...atual,
        penalidadeMin: 35,
        penalidadeMax: 50,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service.salvar(eventoId, {
        ...atual,
        penalidadeMin: null,
        penalidadeMax: null,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      service.salvar(eventoId, {
        ...atual,
        penalidadeMin: 30,
        penalidadeMax: 30,
      }),
    ).resolves.toMatchObject({ penalidadeMin: 30, penalidadeMax: 30 });
  });

  it('recusa desafio de outro evento e evento inexistente com 404', async () => {
    const atual: Configuracao = await service.obter(eventoId);

    await expect(
      service.salvar(eventoId, {
        ...atual,
        criteriosDesempate: [
          {
            ordem: 1,
            tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
            desafioId: desafioDeOutroEventoId,
            descricao: 'Desafio alheio',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.salvar(999_999_999, configuracaoBase()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('substitui e encurta os critérios, e uma falha desfaz toda a gravação', async () => {
    const atual: Configuracao = await service.obter(eventoId);

    const salva: Configuracao = await service.salvar(eventoId, {
      ...atual,
      criteriosDesempate: [
        {
          ordem: 1,
          tipo: TipoCriterioDesempate.MENOR_PENALIDADE,
          desafioId: null,
          descricao: 'Menor penalidade',
        },
        { ...atual.criteriosDesempate[1], ordem: 2 },
      ],
    });
    expect(salva.criteriosDesempate.map((c) => c.tipo)).toEqual([
      TipoCriterioDesempate.MENOR_PENALIDADE,
      TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
    ]);

    // Fator válido, mas item fica abaixo do lançado: nada pode ser gravado.
    const itemLancado = salva.itensBonificacao.find(
      (i) => i.nome === 'Grito de guerra',
    )!;
    await expect(
      service.salvar(eventoId, {
        ...salva,
        fatoresPresenca: salva.fatoresPresenca.map((f) => ({
          ...f,
          fator: 0.5,
        })),
        itensBonificacao: salva.itensBonificacao.map((i) =>
          i.id === itemLancado.id ? { ...i, teto: 1 } : i,
        ),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.obter(eventoId)).resolves.toEqual(salva);
  });

  it('preserva o critério usado em apuração ao reordenar e recusa removê-lo', async () => {
    const atual: Configuracao = await service.obter(eventoId);
    // Neste ponto: 1º Menor penalidade, 2º Maior pontuação na Robótica.
    const robotica = await prisma.criterioDesempate.findFirstOrThrow({
      where: { eventoId, desafioId: desafioIds[1] },
    });
    const apuracao = await prisma.apuracao.create({
      data: {
        eventoId,
        versao: 1,
        usuarioId: usuarioId!,
        operacaoId: randomUUID(),
      },
    });
    await prisma.classificacaoGrupo.create({
      data: {
        apuracaoId: apuracao.id,
        grupoId: grupoIds[0],
        eventoId,
        posicao: 1,
        pontosTotal: 0,
      },
    });
    await prisma.apuracaoCriterio.create({
      data: {
        apuracaoId: apuracao.id,
        criterioDesempateId: robotica.id,
        grupoId: grupoIds[0],
        ordem: robotica.ordem,
      },
    });

    const [penalidade, roboticaDto] = atual.criteriosDesempate;
    const invertida: Configuracao = await service.salvar(eventoId, {
      ...atual,
      criteriosDesempate: [
        { ...roboticaDto, ordem: 1 },
        { ...penalidade, ordem: 2 },
      ],
    });
    expect(invertida.criteriosDesempate.map((c) => c.descricao)).toEqual([
      'Maior pontuação na Robótica',
      'Menor penalidade',
    ]);
    // O id usado na apuração continua sendo a Robótica, agora em 1º.
    await expect(
      prisma.criterioDesempate.findUniqueOrThrow({
        where: { id: robotica.id },
      }),
    ).resolves.toMatchObject({
      ordem: 1,
      tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
      desafioId: desafioIds[1],
    });

    await expect(
      service.salvar(eventoId, {
        ...invertida,
        criteriosDesempate: [{ ...invertida.criteriosDesempate[1], ordem: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.obter(eventoId)).resolves.toEqual(invertida);

    // Remover o critério que não foi usado continua permitido.
    await expect(
      service.salvar(eventoId, {
        ...invertida,
        criteriosDesempate: [invertida.criteriosDesempate[0]],
      }),
    ).resolves.toMatchObject({
      criteriosDesempate: [{ descricao: 'Maior pontuação na Robótica' }],
    });
  });
});
