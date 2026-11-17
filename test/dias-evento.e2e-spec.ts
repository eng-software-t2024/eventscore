import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const testJwtSecret = new TextEncoder().encode(
  'eventscore-e2e-only-secret-not-a-production-credential',
);
const testJwtIssuer = 'https://eventscore-e2e.invalid/auth/v1';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

describe('DiasEventoController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let dependencyTablesAvailable = false;
  const createdEventIds = new Set<number>();
  let sequence = 0;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(databaseUrl)) {
      throw new Error(
        'O e2e de dias exige DATABASE_URL apontando para um banco de teste',
      );
    }

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
    await app.init();
    prisma = app.get(PrismaService);

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('presenca', 'desafio')
    `;
    dependencyTablesAvailable = tables.length === 2;
    token = await createTestAdminToken();
  });

  afterAll(async () => {
    if (!app || !prisma) return;
    for (const eventoId of createdEventIds) {
      await prisma.diaEvento.deleteMany({ where: { idEvento: eventoId } });
      await prisma.evento.delete({ where: { idEvento: eventoId } });
    }
    await app.close();
  });

  it('rejeita ausência e token inválido sem acessar o domínio', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  it('cria, lista, atualiza e exclui dias com um administrador de teste', async () => {
    const eventoId = await createEvent();
    const first = await createDay(eventoId, 1, '2026-11-20').expect(201);
    const second = await createDay(eventoId, 2, '2026-11-21').expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.map((item: { id: number }) => item.id)).toEqual([
          first.body.id,
          second.body.id,
        ]);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${eventoId}/dias/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: '2026-11-22' })
      .expect(200)
      .expect(({ body }) => expect(body.data).toBe('2026-11-22'));

    const deletion = request(app.getHttpServer())
      .delete(`/api/v1/eventos/${eventoId}/dias/${second.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    if (dependencyTablesAvailable) {
      await deletion.expect(204);
    } else {
      await deletion
        .expect(503)
        .expect(({ body }) =>
          expect(body.message).toBe(
            'Não foi possível verificar as dependências do dia. Tente novamente mais tarde.',
          ),
        );
    }
  });

  it('valida vínculo, duplicidade e regras do período do evento', async () => {
    const eventoId = await createEvent();
    const otherEventoId = await createEvent();
    const day = await createDay(eventoId, 1, '2026-11-20').expect(201);

    await createDay(eventoId, 1, '2026-11-21')
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'Já existe um dia com este número neste evento.',
        ),
      );
    await createDay(eventoId, 2, '2026-11-20').expect(409);
    await createDay(eventoId, 4, '2026-11-23')
      .expect(422)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'O número do dia excede a quantidade configurada para o evento.',
        ),
      );

    await request(app.getHttpServer())
      .patch(`/api/v1/eventos/${otherEventoId}/dias/${day.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: '2026-11-21' })
      .expect(404);
  });

  async function createTestAdminToken() {
    return new SignJWT({
      role: 'authenticated',
      email: 'admin-e2e@test.invalid',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(`admin-e2e-${Date.now()}`)
      .setIssuer(testJwtIssuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(testJwtSecret);
  }

  async function createEvent() {
    sequence += 1;
    const event = await prisma.evento.create({
      data: {
        nome: `Evento e2e ${Date.now()}-${sequence}`,
        ano: 2026,
        dataInicio: new Date('2026-11-20T00:00:00.000Z'),
        dataFim: new Date('2026-11-23T00:00:00.000Z'),
        quantidadeDias: 3,
        ativo: false,
      },
      select: { idEvento: true },
    });
    createdEventIds.add(event.idEvento);
    return event.idEvento;
  }

  function createDay(eventoId: number, numeroDia: number, data: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/eventos/${eventoId}/dias`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numeroDia, data });
  }
});
