import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Acesso a bônus e penalidades (#206 parte 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventId: number;
  let groupId: number;
  let itemId: number;
  let token: string;
  let penaltyId: number;
  const identifier = randomUUID();
  const email = `pontuacao-${identifier}@example.test`;
  const password = 'senha-exclusiva-teste-206';

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
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.usuario.create({
      data: {
        nome: 'Administrador de teste 206',
        email,
        senhaHash: await app.get(PasswordHashService).hash(password),
        perfil: 'ADMIN',
        ativo: true,
      },
    });

    const event = await prisma.evento.create({
      data: {
        nome: `Evento 206 ${identifier}`,
        ano: 2098,
        dataInicio: new Date('2098-05-10T00:00:00.000Z'),
        dataFim: new Date('2098-05-12T00:00:00.000Z'),
        quantidadeDias: 3,
        penalidadeMin: 10,
        penalidadeMax: 50,
      },
    });
    eventId = event.id;

    const group = await prisma.grupo.create({
      data: { eventoId: eventId, nome: 'Alfa', cor: '#FF5733' },
    });
    groupId = group.id;

    const item = await prisma.itemBonificacao.create({
      data: { eventoId: eventId, nome: 'Uniformização', teto: 10 },
    });
    itemId = item.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha: password })
      .expect(200);
    token = login.body.token;
  });

  afterAll(async () => {
    // Lançamentos geram auditoria, e a V8 bloqueia exclusão do evento/usuário
    // referenciados (ADR 0004). Os fixtures ficam isolados por UUID no banco
    // exclusivo de testes, então apenas fechamos a aplicação.
    await app?.close();
  });

  it('protege as rotas sem token', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventId}/bonificacoes`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventId}/penalidades`)
      .expect(401);
  });

  it('substitui e lista bonificações respeitando o teto', async () => {
    const replace = await request(app.getHttpServer())
      .put(`/api/v1/eventos/${eventId}/bonificacoes/${groupId}`)
      .auth(token, { type: 'bearer' })
      .send([{ itemBonificacaoId: itemId, valor: 8 }])
      .expect(200);

    expect(replace.body).toMatchObject({
      grupoId: groupId,
      itens: [{ itemBonificacaoId: itemId, valor: 8 }],
      total: 8,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventId}/bonificacoes`)
      .auth(token, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => {
        const grupo = body.find(
          (entry: { grupoId: number }) => entry.grupoId === groupId,
        );
        expect(grupo.total).toBe(8);
        // O id do item é o registroId do histórico (RF18).
        expect(grupo.itens).toEqual([
          { id: replace.body.itens[0].id, itemBonificacaoId: itemId, valor: 8 },
        ]);
      });

    await request(app.getHttpServer())
      .put(`/api/v1/eventos/${eventId}/bonificacoes/${groupId}`)
      .auth(token, { type: 'bearer' })
      .send([{ itemBonificacaoId: itemId, valor: 11 }])
      .expect(422);
  });

  it('rejeita item inválido com 400 antes de chegar ao banco', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/eventos/${eventId}/bonificacoes/${groupId}`)
      .auth(token, { type: 'bearer' })
      .send([{ itemBonificacaoId: itemId, valor: -1 }])
      .expect(400);

    await request(app.getHttpServer())
      .put(`/api/v1/eventos/${eventId}/bonificacoes/${groupId}`)
      .auth(token, { type: 'bearer' })
      .send({ bonificacoes: [{ itemBonificacaoId: itemId, valor: 8 }] })
      .expect(400);
  });

  it('reenvio idempotente mantém o id e o histórico sem duplicar', async () => {
    const row = await prisma.bonificacaoGrupo.findFirst({
      where: { grupoId: groupId },
      select: { id: true },
    });
    expect(row).not.toBeNull();
    const registroId = row!.id;

    // O id devolvido pela API é o mesmo do registro auditado.
    const lista = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventId}/bonificacoes`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    const doGrupo = lista.body.find(
      (entry: { grupoId: number }) => entry.grupoId === groupId,
    );
    expect(doGrupo.itens[0].id).toBe(registroId);

    const auditoriaAntes = await request(app.getHttpServer())
      .get('/api/v1/auditoria')
      .query({ entidade: 'BONIFICACAO_GRUPO', registroId })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(auditoriaAntes.body).toHaveLength(1);
    expect(auditoriaAntes.body[0].operacao).toBe('INSERT');

    await request(app.getHttpServer())
      .put(`/api/v1/eventos/${eventId}/bonificacoes/${groupId}`)
      .auth(token, { type: 'bearer' })
      .send([{ itemBonificacaoId: itemId, valor: 8 }])
      .expect(200);

    const aindaMesma = await prisma.bonificacaoGrupo.findFirst({
      where: { grupoId: groupId },
      select: { id: true },
    });
    expect(aindaMesma!.id).toBe(registroId);

    const auditoriaDepois = await request(app.getHttpServer())
      .get('/api/v1/auditoria')
      .query({ entidade: 'BONIFICACAO_GRUPO', registroId })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(auditoriaDepois.body).toHaveLength(1);
  });

  it('executa CRUD de penalidade e valida a faixa do evento', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/eventos/${eventId}/penalidades`)
      .auth(token, { type: 'bearer' })
      .send({ grupoId: groupId, pontos: 20, justificativa: 'Atraso' })
      .expect(201);
    penaltyId = created.body.id;

    expect(created.body).toMatchObject({ grupoId: groupId, pontos: 20 });

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventId}/penalidades`)
      .auth(token, { type: 'bearer' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${eventId}/penalidades/${penaltyId}`)
      .auth(token, { type: 'bearer' })
      .send({ pontos: 30, justificativa: 'Atraso atualizado' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/eventos/${eventId}/penalidades`)
      .auth(token, { type: 'bearer' })
      .send({ grupoId: groupId, pontos: 5, justificativa: 'Fora da faixa' })
      .expect(422);

    await request(app.getHttpServer())
      .delete(`/api/v1/eventos/${eventId}/penalidades/${penaltyId}`)
      .auth(token, { type: 'bearer' })
      .expect(204);
  });

  it('rejeita justificativa só com espaços com 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/eventos/${eventId}/penalidades`)
      .auth(token, { type: 'bearer' })
      .send({ grupoId: groupId, pontos: 20, justificativa: '   ' })
      .expect(400);
  });
});
