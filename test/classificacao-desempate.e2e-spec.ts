import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * #206 parte 3 com PostgreSQL real. A auditoria e as decisões de desempate
 * são imutáveis (V8, V11), então os dados criados aqui ficam no banco de
 * testes (ADR 0004); nomes e e-mail únicos evitam colisão entre execuções.
 */
describe('Classificação e desempate manual E2E (#206 parte 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let eventoId: number;
  const ids = { alfa: 0, beta: 0, gama: 0, delta: 0 };

  const sufixo = randomUUID();
  const email = `t206p3-${sufixo}@example.test`;
  const senha = 'senha-exclusiva-integracao-t206p3';
  const nomeAdmin = 'Administrador T206 parte 3';

  const http = () => request(app.getHttpServer());
  const classificacao = () =>
    http()
      .get(`/api/v1/eventos/${eventoId}/classificacao`)
      .set('Authorization', `Bearer ${token}`);
  const desempatar = (body: unknown) =>
    http()
      .post(`/api/v1/eventos/${eventoId}/desempates`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        stopAtFirstError: false,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.usuario.create({
      data: {
        nome: nomeAdmin,
        email,
        perfil: 'ADMIN',
        ativo: true,
        senhaHash: await app.get(PasswordHashService).hash(senha),
      },
    });
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = login.body.token;

    const evento = await prisma.evento.create({
      data: {
        nome: `Arena T206 parte 3 ${sufixo}`,
        ano: 2098,
        dataInicio: new Date('2098-11-23T00:00:00.000Z'),
        dataFim: new Date('2098-11-24T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventoId = evento.id;

    const dia = await prisma.diaEvento.create({
      data: {
        eventoId,
        numeroDia: 1,
        data: new Date('2098-11-23T00:00:00.000Z'),
      },
    });

    for (const [chave, nome, cor] of [
      ['alfa', 'Alfa', '#FF5733'],
      ['beta', 'Beta', '#3380FF'],
      ['gama', 'Gama', '#15803D'],
      ['delta', 'Delta', '#B7791F'],
    ] as const) {
      const grupo = await prisma.grupo.create({
        data: { eventoId, nome, cor },
      });
      ids[chave] = grupo.id;
    }

    // 2º e 3º lugar valem o mesmo: Beta e Gama empatam no 2º lugar.
    const desafio = await prisma.desafio.create({
      data: {
        eventoId,
        diaId: dia.id,
        nome: 'Hackathon',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
            { colocacao: 3, pontos: 80 },
            { colocacao: 4, pontos: 50 },
          ],
        },
      },
    });
    await prisma.resultadoDesafio.createMany({
      data: [
        { grupoId: ids.alfa, colocacao: 1 },
        { grupoId: ids.beta, colocacao: 2 },
        { grupoId: ids.gama, colocacao: 3 },
        { grupoId: ids.delta, colocacao: 4 },
      ].map((r) => ({
        eventoId,
        desafioId: desafio.id,
        ausente: false,
        ...r,
      })),
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /classificacao mostra o empate pendente na mesma posição', async () => {
    const res = await classificacao().expect(200);

    expect(
      res.body.dados.map(
        (l: { grupo: string; posicao: number; empatado: boolean }) => [
          l.posicao,
          l.grupo,
          l.empatado,
        ],
      ),
    ).toEqual([
      [1, 'Alfa', false],
      [2, 'Beta', true],
      [2, 'Gama', true],
      [4, 'Delta', false],
    ]);
    expect(res.body.dados[0]).toEqual({
      posicao: 1,
      grupoId: ids.alfa,
      grupo: 'Alfa',
      cor: '#FF5733',
      pontosDesafios: 100,
      bonificacao: 0,
      penalidade: 0,
      total: 100,
      empatado: false,
    });
    expect(res.body.resumo).toEqual({
      desafiosLancados: 1,
      desafiosTotais: 1,
      empatesPendentes: [[ids.beta, ids.gama]],
    });
  });

  it('GET /classificacao responde 404 para evento inexistente e 401 sem token', async () => {
    await http()
      .get('/api/v1/eventos/2147483647/classificacao')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await http().get(`/api/v1/eventos/${eventoId}/classificacao`).expect(401);
  });

  it('POST /desempates recusa envio inválido sem gravar nada', async () => {
    await desempatar({
      posicoes: [{ grupoId: ids.beta, posicao: 2 }],
      justificativa: 'Sorteio',
    }).expect(400);

    await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 2 },
        { grupoId: ids.gama, posicao: 3 },
      ],
      justificativa: '   ',
    }).expect(400);

    const foraDoEmpate = await desempatar({
      posicoes: [
        { grupoId: ids.alfa, posicao: 2 },
        { grupoId: ids.gama, posicao: 3 },
      ],
      justificativa: 'Sorteio',
    }).expect(422);
    expect(foraDoEmpate.body.message).toBe('O grupo Alfa não está empatado.');

    const faixaErrada = await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 2 },
        { grupoId: ids.gama, posicao: 4 },
      ],
      justificativa: 'Sorteio',
    }).expect(422);
    expect(faixaErrada.body.message).toBe(
      'As posições do empate no 2º lugar devem ir do 2º ao 3º, sem repetir.',
    );

    await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 2 },
        { grupoId: ids.beta, posicao: 3 },
      ],
      justificativa: 'Sorteio',
    }).expect(422);

    expect(await prisma.apuracao.count({ where: { eventoId } })).toBe(0);
  });

  it('POST /desempates grava apuração, classificação, decisões e auditoria', async () => {
    const res = await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 3 },
        { grupoId: ids.gama, posicao: 2 },
      ],
      justificativa: '  Sorteio na frente das equipes  ',
    }).expect(201);

    expect(res.body).toEqual({
      posicoes: [
        { grupoId: ids.gama, posicao: 2 },
        { grupoId: ids.beta, posicao: 3 },
      ],
      justificativa: 'Sorteio na frente das equipes',
      responsavel: nomeAdmin,
      dataHora: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    });

    const apuracoes = await prisma.apuracao.findMany({
      where: { eventoId },
      include: { classificacoes: { orderBy: { posicao: 'asc' } } },
    });
    expect(apuracoes).toHaveLength(1);
    expect(apuracoes[0]).toMatchObject({ versao: 1, status: 'PROVISORIA' });
    expect(
      apuracoes[0].classificacoes.map((c) => [
        c.posicao,
        c.grupoId,
        c.pontosTotal,
        c.desempateManual,
      ]),
    ).toEqual([
      [1, ids.alfa, 100, false],
      [2, ids.gama, 80, true],
      [3, ids.beta, 80, true],
      [4, ids.delta, 50, false],
    ]);

    const decisoes = await prisma.desempateManual.findMany({
      where: { eventoId, vigente: true },
      orderBy: { posicao: 'asc' },
    });
    expect(decisoes.map((d) => [d.grupoId, d.posicao])).toEqual([
      [ids.gama, 2],
      [ids.beta, 3],
    ]);

    const auditorias = await prisma.auditoria.findMany({
      where: { eventoId },
      select: { entidade: true, operacao: true, operacaoId: true },
    });
    expect(auditorias.map((a) => `${a.entidade}:${a.operacao}`).sort()).toEqual(
      ['APURACAO:INSERT', 'DESEMPATE_MANUAL:INSERT', 'DESEMPATE_MANUAL:INSERT'],
    );
    expect(new Set(auditorias.map((a) => a.operacaoId)).size).toBe(1);

    const atual = await classificacao().expect(200);
    expect(
      atual.body.dados.map(
        (l: { grupo: string; posicao: number; empatado: boolean }) => [
          l.posicao,
          l.grupo,
          l.empatado,
        ],
      ),
    ).toEqual([
      [1, 'Alfa', false],
      [2, 'Gama', false],
      [3, 'Beta', false],
      [4, 'Delta', false],
    ]);
    expect(atual.body.resumo.empatesPendentes).toEqual([]);
  });

  it('reenviar a mesma decisão não grava de novo', async () => {
    const res = await desempatar({
      posicoes: [
        { grupoId: ids.gama, posicao: 2 },
        { grupoId: ids.beta, posicao: 3 },
      ],
      justificativa: 'Sorteio na frente das equipes',
    }).expect(201);

    expect(res.body.responsavel).toBe(nomeAdmin);
    expect(await prisma.apuracao.count({ where: { eventoId } })).toBe(1);
    expect(await prisma.auditoria.count({ where: { eventoId } })).toBe(3);
  });

  it('um novo envio substitui a decisão anterior', async () => {
    await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 2 },
        { grupoId: ids.gama, posicao: 3 },
      ],
      justificativa: 'Sorteio refeito com a comissão completa',
    }).expect(201);

    const apuracoes = await prisma.apuracao.findMany({
      where: { eventoId },
      orderBy: { versao: 'asc' },
    });
    expect(apuracoes.map((a) => a.versao)).toEqual([1, 2]);

    const todas = await prisma.desempateManual.findMany({
      where: { eventoId },
      orderBy: { id: 'asc' },
    });
    expect(todas).toHaveLength(4);
    const antigas = todas.slice(0, 2);
    const novas = todas.slice(2);
    expect(antigas.every((d) => !d.vigente)).toBe(true);
    expect(
      novas.every((d) => d.vigente && d.apuracaoId === apuracoes[1].id),
    ).toBe(true);
    expect(new Set(novas.map((d) => d.decisaoAnteriorId))).toEqual(
      new Set(antigas.map((d) => d.id)),
    );

    const atual = await classificacao().expect(200);
    expect(
      atual.body.dados.map((l: { grupo: string; posicao: number }) => [
        l.posicao,
        l.grupo,
      ]),
    ).toEqual([
      [1, 'Alfa'],
      [2, 'Beta'],
      [3, 'Gama'],
      [4, 'Delta'],
    ]);
  });

  it('correção que desfaz o empate passa a valer sobre a decisão manual (RF18)', async () => {
    const item = await prisma.itemBonificacao.create({
      data: { eventoId, nome: 'Grito de guerra', teto: 10 },
    });
    await http()
      .put(`/api/v1/eventos/${eventoId}/bonificacoes/${ids.gama}`)
      .set('Authorization', `Bearer ${token}`)
      .send([{ itemBonificacaoId: item.id, valor: 5 }])
      .expect(200);

    const atual = await classificacao().expect(200);
    expect(
      atual.body.dados.map(
        (l: { grupo: string; posicao: number; total: number }) => [
          l.posicao,
          l.grupo,
          l.total,
        ],
      ),
    ).toEqual([
      [1, 'Alfa', 100],
      [2, 'Gama', 85],
      [3, 'Beta', 80],
      [4, 'Delta', 50],
    ]);
    expect(atual.body.resumo.empatesPendentes).toEqual([]);

    const semEmpate = await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 2 },
        { grupoId: ids.gama, posicao: 3 },
      ],
      justificativa: 'Sorteio',
    }).expect(422);
    expect(semEmpate.body.message).toBe(
      'Não há empate para resolver na classificação atual.',
    );
  });
  it('POST /desempates recusa enquanto houver desafio sem lançamento', async () => {
    const dia = await prisma.diaEvento.findFirstOrThrow({
      where: { eventoId },
    });
    await prisma.desafio.create({
      data: {
        eventoId,
        diaId: dia.id,
        nome: 'Perguntas e Respostas',
        pontosColocacao: { create: [{ colocacao: 1, pontos: 100 }] },
      },
    });
    const apuracoesAntes = await prisma.apuracao.count({ where: { eventoId } });

    const res = await desempatar({
      posicoes: [
        { grupoId: ids.beta, posicao: 2 },
        { grupoId: ids.gama, posicao: 3 },
      ],
      justificativa: 'Sorteio',
    }).expect(422);

    expect(res.body.message).toBe(
      'O desempate manual só pode ser registrado depois que todos os desafios forem lançados.',
    );
    expect(await prisma.apuracao.count({ where: { eventoId } })).toBe(
      apuracoesAntes,
    );
  });
});
