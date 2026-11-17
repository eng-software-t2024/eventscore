import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

type EventoFixture = { id: number };

describe('DiasEventoController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dependencyTablesAvailable = false;
  let token = '';
  let adminUserId: number;
  const createdEventIds = new Set<number>();
  let sequence = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('presenca', 'desafio')
    `;
    dependencyTablesAvailable = tables.length === 2;

    const email = `admin-e2e-${Date.now()}@test.invalid`;
    const senha = `e2e-senha-${Date.now()}-segura`;
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Administrador e2e',
        email,
        senhaHash: await argon2.hash(senha),
        perfil: 'ADMIN',
        ativo: true,
      },
      select: { id: true },
    });
    adminUserId = admin.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = login.body.token;
    expect(typeof token).toBe('string');
  });

  afterAll(async () => {
    if (!app || !prisma) return;
    for (const eventoId of createdEventIds) {
      if (dependencyTablesAvailable) {
        await prisma.presenca.deleteMany({ where: { eventoId } });
        await prisma.desafio.deleteMany({ where: { eventoId } });
        await prisma.participante.deleteMany({ where: { eventoId } });
      }
      await prisma.diaEvento.deleteMany({ where: { eventoId } });
      if (dependencyTablesAvailable) {
        await prisma.grupo.deleteMany({ where: { eventoId } });
      }
      await prisma.evento.delete({ where: { id: eventoId } });
    }
    if (adminUserId) {
      await prisma.usuario.delete({ where: { id: adminUserId } });
    }
    await app.close();
  });

  function date(day: number) {
    return new Date(Date.UTC(2026, 10, day));
  }

  async function event(): Promise<EventoFixture> {
    sequence += 1;
    const created = await prisma.evento.create({
      data: {
        nome: `Evento e2e ${Date.now()}-${sequence}`,
        ano: 2026,
        dataInicio: date(20),
        dataFim: date(23),
        quantidadeDias: 3,
        ativo: false,
      },
      select: { id: true },
    });
    createdEventIds.add(created.id);
    return created;
  }

  function createDay(eventId: number, numeroDia: number, day: number) {
    return request(app.getHttpServer())
      .post(`/api/v1/eventos/${eventId}/dias`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numeroDia, data: `2026-11-${String(day).padStart(2, '0')}` });
  }

  it('rejeita ausência e token inválido antes de acessar as rotas de dias', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  it('cria, lista em ordem, atualiza e exclui um dia sem dependências', async () => {
    const fixture = await event();
    const first = await createDay(fixture.id, 1, 20).expect(201);
    const second = await createDay(fixture.id, 2, 21).expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${fixture.id}/dias`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.map((item: { id: number }) => item.id)).toEqual([
          first.body.id,
          second.body.id,
        ]);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${fixture.id}/dias/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: '2026-11-22' })
      .expect(200)
      .expect(({ body }) => expect(body.data).toBe('2026-11-22'));

    const deletion = request(app.getHttpServer())
      .delete(`/api/v1/eventos/${fixture.id}/dias/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    if (dependencyTablesAvailable) {
      await deletion.expect(204);
    } else {
      await deletion.expect(503);
    }
  });

  it('lista em ordem cronológica mesmo quando a criação ocorre fora de ordem', async () => {
    const fixture = await event();
    const later = await createDay(fixture.id, 2, 22).expect(201);
    const earlier = await createDay(fixture.id, 1, 20).expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${fixture.id}/dias`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.map((item: { id: number }) => item.id)).toEqual([
          earlier.body.id,
          later.body.id,
        ]);
      });
  });

  it('retorna 404 para evento inexistente e dia de outro evento', async () => {
    const firstEvent = await event();
    const secondEvent = await event();
    const day = await createDay(firstEvent.id, 1, 20).expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${secondEvent.id}/dias/${day.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: '2026-11-21' })
      .expect(404);
  });

  it('retorna 409 para número e data duplicados no mesmo evento', async () => {
    const fixture = await event();
    await createDay(fixture.id, 1, 20).expect(201);

    await createDay(fixture.id, 1, 21).expect(409);
    await createDay(fixture.id, 2, 20).expect(409);

    const another = await createDay(fixture.id, 3, 22).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${fixture.id}/dias/${another.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numeroDia: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${fixture.id}/dias/${another.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: '2026-11-20' })
      .expect(409);
  });

  it('retorna 400 para data inválida e 422 para regras do evento', async () => {
    const fixture = await event();
    const day = await createDay(fixture.id, 1, 20).expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/eventos/${fixture.id}/dias`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numeroDia: 1, data: '20/11/2026' })
      .expect(400);

    await createDay(fixture.id, 1, 24).expect(422);
    await createDay(fixture.id, 4, 23).expect(422);

    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${fixture.id}/dias/${day.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: '20/11/2026' })
      .expect(400);
  });

  it('retorna 404 ao excluir evento inexistente ou dia de outro evento', async () => {
    const firstEvent = await event();
    const secondEvent = await event();
    const day = await createDay(firstEvent.id, 1, 20).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/eventos/999999/dias/${day.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/eventos/${secondEvent.id}/dias/${day.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('bloqueia exclusão com presença e com desafio, ou falha fechado sem as tabelas', async () => {
    const fixture = await event();
    const presenceDay = await createDay(fixture.id, 1, 20).expect(201);
    const challengeDay = await createDay(fixture.id, 2, 21).expect(201);

    if (!dependencyTablesAvailable) {
      await request(app.getHttpServer())
        .delete(`/api/v1/eventos/${fixture.id}/dias/${presenceDay.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(503)
        .expect(({ body }) => {
          expect(body.message).toBe(
            'Não foi possível verificar as dependências do dia. Tente novamente mais tarde.',
          );
          expect(body.message).not.toContain('presenca');
          expect(body.message).not.toContain('desafio');
        });
      return;
    }

    const group = await prisma.$queryRaw<{ id_grupo: number }[]>`
      INSERT INTO grupo (id_evento, nome, cor)
      VALUES (${fixture.id}, ${`Grupo ${Date.now()}`}, ${`cor-${Date.now()}`})
      RETURNING id_grupo
    `;
    const participant = await prisma.$queryRaw<{ id_participante: number }[]>`
      INSERT INTO participante (id_grupo, id_evento, nome, matricula, turma)
      VALUES (${group[0].id_grupo}, ${fixture.id}, 'Participante e2e', ${`mat-${Date.now()}`}, 'T1')
      RETURNING id_participante
    `;
    await prisma.$executeRaw`
      INSERT INTO presenca (id_evento, id_dia, id_participante, presente)
      VALUES (${fixture.id}, ${presenceDay.body.id}, ${participant[0].id_participante}, true)
    `;
    await prisma.$executeRaw`
      INSERT INTO desafio (id_evento, id_dia, nome, descricao)
      VALUES (${fixture.id}, ${challengeDay.body.id}, 'Desafio e2e', 'Dependência de exclusão')
    `;

    await request(app.getHttpServer())
      .delete(`/api/v1/eventos/${fixture.id}/dias/${presenceDay.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/eventos/${fixture.id}/dias/${challengeDay.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });
});
