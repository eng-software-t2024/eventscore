import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import type { ResultadoSalvoDto } from '../src/modules/resultados/dto/resultado-salvo.dto.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Resultados HTTP, PostgreSQL e Auditoria (T223)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const email = `t223-${randomUUID()}@example.test`;
  const senha = 'senha-exclusiva-integracao-t223';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
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
        nome: 'Administrador T223',
        email,
        perfil: 'ADMIN',
        ativo: true,
        senhaHash: await app.get(PasswordHashService).hash(senha),
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = (login.body as { token: string }).token;
  });

  afterAll(async () => {
    // Eventos que geram auditoria não podem ser apagados pelo RESTRICT da V8 (ADR 0004);
    // mantemos fixtures isoladas por UUID no banco exclusivo de testes.
    await app?.close();
  });

  async function criarCenario(totalGrupos = 2, configurarSegundo = true) {
    const evento = await prisma.evento.create({
      data: {
        nome: `Evento T223 ${randomUUID()}`,
        ano: 2096,
        dataInicio: new Date('2096-07-10T00:00:00Z'),
        dataFim: new Date('2096-07-11T00:00:00Z'),
        quantidadeDias: 1,
        ativo: false,
      },
    });

    const dia = await prisma.diaEvento.create({
      data: {
        eventoId: evento.id,
        numeroDia: 1,
        data: new Date('2096-07-10T00:00:00Z'),
      },
    });

    const grupos = [];
    for (let i = 1; i <= totalGrupos; i++) {
      grupos.push(
        await prisma.grupo.create({
          data: {
            eventoId: evento.id,
            nome: `Grupo ${i} ${randomUUID().slice(0, 6)}`,
            cor: `#2233${String(i).padStart(2, '0')}`,
          },
        }),
      );
    }

    const pontos =
      totalGrupos === 0
        ? []
        : [
            { colocacao: 1, pontos: 100 },
            ...(totalGrupos >= 2 && configurarSegundo
              ? [{ colocacao: 2, pontos: 80 }]
              : []),
          ];

    const desafio = await prisma.desafio.create({
      data: {
        eventoId: evento.id,
        diaId: dia.id,
        nome: `Desafio ${randomUUID().slice(0, 8)}`,
        pontosColocacao: { create: pontos },
      },
    });

    return { evento, desafio, grupos };
  }

  function endpoint(eventoId: number, desafioId: number) {
    return `/api/v1/eventos/${eventoId}/desafios/${desafioId}/resultados`;
  }

  it('recusa chamadas sem token com 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/1/resultados')
      .expect(401);
  });

  it('retorna linhas pendentes no GET antes do primeiro lançamento e [] sem grupos', async () => {
    const { evento, desafio, grupos } = await criarCenario(2);

    await request(app.getHttpServer())
      .get(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .expect(200, [
        {
          id: null,
          grupoId: grupos[0].id,
          colocacao: null,
          ausente: false,
          pontos: 0,
        },
        {
          id: null,
          grupoId: grupos[1].id,
          colocacao: null,
          ausente: false,
          pontos: 0,
        },
      ]);

    const semGrupos = await criarCenario(0);
    await request(app.getHttpServer())
      .get(endpoint(semGrupos.evento.id, semGrupos.desafio.id))
      .auth(token, { type: 'bearer' })
      .expect(200, []);
  });

  it('salva colocações, preserva IDs em troca 1º↔2º e evita auditoria no reenvio igual', async () => {
    const { evento, desafio, grupos } = await criarCenario(2);
    const [g1, g2] = grupos;

    // 1. Primeiro lançamento (1º e 2º)
    const primeiro = (
      await request(app.getHttpServer())
        .put(endpoint(evento.id, desafio.id))
        .auth(token, { type: 'bearer' })
        .send([
          { grupoId: g1.id, colocacao: 1, ausente: false },
          { grupoId: g2.id, colocacao: 2, ausente: false },
        ])
        .expect(200)
    ).body as ResultadoSalvoDto[];

    expect(primeiro[0]).toMatchObject({
      grupoId: g1.id,
      colocacao: 1,
      ausente: false,
      pontos: 100,
    });
    expect(primeiro[1]).toMatchObject({
      grupoId: g2.id,
      colocacao: 2,
      ausente: false,
      pontos: 80,
    });
    expect(typeof primeiro[0].id).toBe('number');
    expect(typeof primeiro[1].id).toBe('number');

    // 2. Reenvio igual em ordem invertida -> mesmos IDs e nenhuma nova auditoria
    const auditoriasAposInsert = await prisma.auditoria.count({
      where: { eventoId: evento.id },
    });
    expect(auditoriasAposInsert).toBe(2);

    const reenvio = (
      await request(app.getHttpServer())
        .put(endpoint(evento.id, desafio.id))
        .auth(token, { type: 'bearer' })
        .send([
          { grupoId: g2.id, colocacao: 2, ausente: false },
          { grupoId: g1.id, colocacao: 1, ausente: false },
        ])
        .expect(200)
    ).body as ResultadoSalvoDto[];

    expect(reenvio).toEqual(primeiro);
    expect(
      await prisma.auditoria.count({ where: { eventoId: evento.id } }),
    ).toBe(2);

    // 3. Troca 1º ↔ 2º -> preserva IDs e grava UPDATE só com estado original/final
    const trocado = (
      await request(app.getHttpServer())
        .put(endpoint(evento.id, desafio.id))
        .auth(token, { type: 'bearer' })
        .send([
          { grupoId: g1.id, colocacao: 2, ausente: false },
          { grupoId: g2.id, colocacao: 1, ausente: false },
        ])
        .expect(200)
    ).body as ResultadoSalvoDto[];

    expect(trocado).toEqual([
      {
        id: primeiro[0].id,
        grupoId: g1.id,
        colocacao: 2,
        ausente: false,
        pontos: 80,
      },
      {
        id: primeiro[1].id,
        grupoId: g2.id,
        colocacao: 1,
        ausente: false,
        pontos: 100,
      },
    ]);

    const updates = await prisma.auditoria.findMany({
      where: { eventoId: evento.id, operacao: 'UPDATE' },
      include: { detalhes: true },
    });
    expect(updates).toHaveLength(2);
    expect(updates[0].operacaoId).toBe(updates[1].operacaoId);

    // 4. Alterna ausência e todos ausentes mantendo IDs
    const comAusencia = (
      await request(app.getHttpServer())
        .put(endpoint(evento.id, desafio.id))
        .auth(token, { type: 'bearer' })
        .send([
          { grupoId: g1.id, colocacao: 1, ausente: false },
          { grupoId: g2.id, colocacao: null, ausente: true },
        ])
        .expect(200)
    ).body as ResultadoSalvoDto[];

    expect(comAusencia).toEqual([
      {
        id: primeiro[0].id,
        grupoId: g1.id,
        colocacao: 1,
        ausente: false,
        pontos: 100,
      },
      {
        id: primeiro[1].id,
        grupoId: g2.id,
        colocacao: null,
        ausente: true,
        pontos: 0,
      },
    ]);

    await request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: g1.id, colocacao: null, ausente: true },
        { grupoId: g2.id, colocacao: null, ausente: true },
      ])
      .expect(200, [
        {
          id: primeiro[0].id,
          grupoId: g1.id,
          colocacao: null,
          ausente: true,
          pontos: 0,
        },
        {
          id: primeiro[1].id,
          grupoId: g2.id,
          colocacao: null,
          ausente: true,
          pontos: 0,
        },
      ]);
  });

  it('valida 400, 404 de isolamento e 422 com rollback completo', async () => {
    const { evento, desafio, grupos } = await criarCenario(2, false);
    const outro = await criarCenario(1);
    const [g1, g2] = grupos;

    await request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([])
      .expect(400);

    await request(app.getHttpServer())
      .put(endpoint(evento.id, outro.desafio.id))
      .auth(token, { type: 'bearer' })
      .send([{ grupoId: g1.id, colocacao: 1, ausente: false }])
      .expect(404);

    await request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: g1.id, colocacao: 1, ausente: false },
        { grupoId: outro.grupos[0].id, colocacao: 2, ausente: false },
      ])
      .expect(404);

    // Lacuna 1..P (presente em 2º, outro ausente) -> 422
    await request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: g1.id, colocacao: 2, ausente: false },
        { grupoId: g2.id, colocacao: null, ausente: true },
      ])
      .expect(422);

    // Colocação 2º sem pontuação configurada -> 422
    await request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: g1.id, colocacao: 1, ausente: false },
        { grupoId: g2.id, colocacao: 2, ausente: false },
      ])
      .expect(422);

    expect(
      await prisma.resultadoDesafio.count({ where: { desafioId: desafio.id } }),
    ).toBe(0);
    expect(
      await prisma.auditoria.count({ where: { eventoId: evento.id } }),
    ).toBe(0);
  });

  it('mantém integridade sob duas gravações simultâneas do mesmo desafio', async () => {
    const { evento, desafio, grupos } = await criarCenario(2);
    const [g1, g2] = grupos;

    const req1 = request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: g1.id, colocacao: 1, ausente: false },
        { grupoId: g2.id, colocacao: 2, ausente: false },
      ]);
    const req2 = request(app.getHttpServer())
      .put(endpoint(evento.id, desafio.id))
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: g1.id, colocacao: 2, ausente: false },
        { grupoId: g2.id, colocacao: 1, ausente: false },
      ]);

    const [res1, res2] = await Promise.all([req1, req2]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const finais = await prisma.resultadoDesafio.findMany({
      where: { desafioId: desafio.id },
      orderBy: { grupoId: 'asc' },
    });
    expect(finais).toHaveLength(2);
    expect(new Set(finais.map((item) => item.colocacao))).toEqual(
      new Set([1, 2]),
    );
  });
});
