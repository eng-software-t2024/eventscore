import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

describe('Frequência individual por participante e dia (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventoId: number;
  let outroEventoId: number;
  let participanteId: number;
  let outroParticipanteId: number;
  let dia1Id: number;
  let dia2Id: number;
  let outroDiaId: number;
  let token: string;
  let usuarioId: number;

  const email = `t205-${randomUUID()}@example.test`;
  const senha = 'senha-exclusiva-t205-teste';

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

    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Administrador T205',
        email,
        perfil: 'ADMIN',
        ativo: true,
        senhaHash: await app.get(PasswordHashService).hash(senha),
      },
    });
    usuarioId = usuario.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = login.body.token;

    const evento = await prisma.evento.create({
      data: {
        nome: `Evento T205 ${randomUUID()}`,
        ano: 2098,
        dataInicio: new Date('2098-11-20T00:00:00.000Z'),
        dataFim: new Date('2098-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventoId = evento.id;
    const outroEvento = await prisma.evento.create({
      data: {
        nome: `Outro T205 ${randomUUID()}`,
        ano: 2099,
        dataInicio: new Date('2099-11-20T00:00:00.000Z'),
        dataFim: new Date('2099-11-20T00:00:00.000Z'),
        quantidadeDias: 1,
        ativo: false,
      },
    });
    outroEventoId = outroEvento.id;

    const grupo = await prisma.grupo.create({
      data: { eventoId, nome: `Grupo T205 ${randomUUID()}`, cor: '#123456' },
    });
    const outroGrupo = await prisma.grupo.create({
      data: {
        eventoId: outroEventoId,
        nome: `Outro Grupo ${randomUUID()}`,
        cor: '#654321',
      },
    });
    const participante = await prisma.participante.create({
      data: {
        eventoId,
        grupoId: grupo.id,
        nome: 'Pessoa T205',
        matricula: randomUUID().slice(0, 20),
        turma: 'T205',
      },
    });
    const outroParticipante = await prisma.participante.create({
      data: {
        eventoId: outroEventoId,
        grupoId: outroGrupo.id,
        nome: 'Outra Pessoa',
        matricula: randomUUID().slice(0, 20),
        turma: 'T205',
      },
    });
    participanteId = participante.id;
    outroParticipanteId = outroParticipante.id;

    const outroDia = await prisma.diaEvento.create({
      data: {
        eventoId: outroEventoId,
        numeroDia: 1,
        data: new Date('2099-11-20T00:00:00.000Z'),
      },
    });
    outroDiaId = outroDia.id;

    const dia1 = await prisma.diaEvento.create({
      data: {
        eventoId,
        numeroDia: 1,
        data: new Date('2098-11-20T00:00:00.000Z'),
      },
    });
    const dia2 = await prisma.diaEvento.create({
      data: {
        eventoId,
        numeroDia: 2,
        data: new Date('2098-11-21T00:00:00.000Z'),
      },
    });
    dia1Id = dia1.id;
    dia2Id = dia2.id;

    await prisma.fatorPresenca.createMany({
      data: [
        { eventoId, diasPresentes: 0, fator: 0 },
        { eventoId, diasPresentes: 1, fator: 0.5 },
        { eventoId, diasPresentes: 2, fator: 1 },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.presenca.deleteMany({
        where: { eventoId: { in: [eventoId, outroEventoId] } },
      });
      await prisma.fatorPresenca.deleteMany({
        where: { eventoId: { in: [eventoId, outroEventoId] } },
      });
      await prisma.participante.deleteMany({
        where: { id: { in: [participanteId, outroParticipanteId] } },
      });
      await prisma.diaEvento.deleteMany({
        where: { eventoId: { in: [eventoId, outroEventoId] } },
      });
      await prisma.grupo.deleteMany({
        where: { eventoId: { in: [eventoId, outroEventoId] } },
      });
      await prisma.evento.deleteMany({
        where: { id: { in: [eventoId, outroEventoId] } },
      });
      await prisma.usuario.delete({ where: { id: usuarioId } });
    }
    await app?.close();
  });

  it('exige autenticação e rejeita token inválido', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  it('registra presença, repete o PUT, altera para ausência e consulta a grade', async () => {
    const diaSemRegistro = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia2Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(diaSemRegistro.body.dados).toEqual([
      expect.objectContaining({ participanteId, presente: false }),
    ]);

    await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(200, {
        participanteId,
        presente: true,
      });

    const consulta = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(consulta.body.dados).toEqual([
      expect.objectContaining({ participanteId, presente: true }),
    ]);
    expect(consulta.body.resumo).toEqual({
      total: 1,
      presentes: 1,
      ausentes: 0,
    });
    const view = await prisma.$queryRaw<
      Array<{ diasPresentes: bigint; fator: number }>
    >(Prisma.sql`
      SELECT dias_presentes AS "diasPresentes", fator
      FROM vw_participante_fator
      WHERE id_evento = ${eventoId} AND id_participante = ${participanteId}
    `);
    expect(Number(view[0].diasPresentes)).toBe(1);
    expect(Number(view[0].fator)).toBe(0.5);

    await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .expect(200)
      .then((res) => expect(res.body.dados[0].presente).toBe(false));
  });

  it('rejeita payload inválido e recursos de outro evento', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias/999999/presencas')
      .auth(token, { type: 'bearer' })
      .expect(404);

    await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: 'sim' })
      .expect(400);
    const grupoSemParticipantes = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .query({ grupoId: 999999 })
      .expect(200);
    expect(grupoSemParticipantes.body).toEqual({
      dados: [],
      resumo: { total: 0, presentes: 0, ausentes: 0 },
    });
    await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${outroParticipanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
    await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/999999/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
    await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${outroDiaId}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
  });
});
