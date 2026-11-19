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
  let segundoParticipanteId: number;
  let outroParticipanteId: number;
  let segundoGrupoId: number;
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
    const segundoGrupo = await prisma.grupo.create({
      data: {
        eventoId,
        nome: `Segundo Grupo T205 ${randomUUID()}`,
        cor: '#ABCDEF',
      },
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
        matricula: 'MAT-T205-A-000001',
        turma: 'T205',
      },
    });
    const segundoParticipante = await prisma.participante.create({
      data: {
        eventoId,
        grupoId: segundoGrupo.id,
        nome: 'Sofia de Ávila T205',
        matricula: 'MAT-T205-B-000002',
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
    segundoParticipanteId = segundoParticipante.id;
    segundoGrupoId = segundoGrupo.id;
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
        where: {
          id: {
            in: [participanteId, segundoParticipanteId, outroParticipanteId],
          },
        },
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
    const semToken = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .expect(401);
    expect(semToken.body).toEqual({
      statusCode: 401,
      message: 'Token ausente ou inválido',
      error: 'Unauthorized',
    });
    const tokenInvalido = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
    expect(tokenInvalido.body).toEqual(semToken.body);

    for (const tokenHeader of [undefined, 'token-invalido']) {
      const antes = await prisma.presenca.count({
        where: { diaId: dia1Id, participanteId },
      });
      const chamada = request(app.getHttpServer()).put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      );
      if (tokenHeader) chamada.set('Authorization', `Bearer ${tokenHeader}`);
      const resposta = await chamada.send({ presente: true }).expect(401);
      expect(resposta.body).toEqual(semToken.body);
      await expect(
        prisma.presenca.count({ where: { diaId: dia1Id, participanteId } }),
      ).resolves.toBe(antes);
    }
  });

  it('filtra GET por grupo, nome, matrícula e interseção sem expor outro evento', async () => {
    const rota = `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`;
    const todos = await request(app.getHttpServer())
      .get(rota)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      todos.body.dados.map(
        (item: { participanteId: number }) => item.participanteId,
      ),
    ).toEqual([participanteId, segundoParticipanteId]);
    expect(todos.body.resumo).toEqual({ total: 2, presentes: 0, ausentes: 2 });
    expect(todos.body.dados).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participanteId: outroParticipanteId }),
      ]),
    );

    const porGrupo = await request(app.getHttpServer())
      .get(rota)
      .query({ grupoId: segundoGrupoId })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      porGrupo.body.dados.map(
        (item: { participanteId: number }) => item.participanteId,
      ),
    ).toEqual([segundoParticipanteId]);
    expect(porGrupo.body.resumo).toEqual({
      total: 1,
      presentes: 0,
      ausentes: 1,
    });

    const porNome = await request(app.getHttpServer())
      .get(rota)
      .query({ busca: 'sofia de ávila' })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      porNome.body.dados.map(
        (item: { participanteId: number }) => item.participanteId,
      ),
    ).toEqual([segundoParticipanteId]);

    const porMatricula = await request(app.getHttpServer())
      .get(rota)
      .query({ busca: 'MAT-T205-A-000001' })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      porMatricula.body.dados.map(
        (item: { participanteId: number }) => item.participanteId,
      ),
    ).toEqual([participanteId]);

    const intersecao = await request(app.getHttpServer())
      .get(rota)
      .query({ grupoId: segundoGrupoId, busca: 'Sofia' })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      intersecao.body.dados.map(
        (item: { participanteId: number }) => item.participanteId,
      ),
    ).toEqual([segundoParticipanteId]);
    const intersecaoVazia = await request(app.getHttpServer())
      .get(rota)
      .query({ grupoId: segundoGrupoId, busca: 'MAT-T205-A-000001' })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(intersecaoVazia.body).toEqual({
      dados: [],
      resumo: { total: 0, presentes: 0, ausentes: 0 },
    });

    const semCorrespondencia = await request(app.getHttpServer())
      .get(rota)
      .query({ busca: 'sem-correspondencia-T205' })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(semCorrespondencia.body).toEqual({
      dados: [],
      resumo: { total: 0, presentes: 0, ausentes: 0 },
    });
  });

  it('registra presença, repete o PUT, altera para ausência e consulta a grade', async () => {
    const diaSemRegistro = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia2Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      diaSemRegistro.body.dados.map(
        (item: { participanteId: number }) => item.participanteId,
      ),
    ).toEqual([participanteId, segundoParticipanteId]);
    expect(
      diaSemRegistro.body.dados.every(
        (item: { presente: boolean }) => !item.presente,
      ),
    ).toBe(true);
    expect(diaSemRegistro.body.resumo).toEqual({
      total: 2,
      presentes: 0,
      ausentes: 2,
    });

    const primeiraMarcacao = await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(200, {
        participanteId,
        presente: true,
      });
    const repeticao = await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(200);
    expect(repeticao.body).toEqual(primeiraMarcacao.body);
    await expect(
      prisma.presenca.count({ where: { diaId: dia1Id, participanteId } }),
    ).resolves.toBe(1);

    const consulta = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(consulta.body.dados).toEqual([
      expect.objectContaining({ participanteId, presente: true }),
      expect.objectContaining({
        participanteId: segundoParticipanteId,
        presente: false,
      }),
    ]);
    expect(consulta.body.resumo).toEqual({
      total: 2,
      presentes: 1,
      ausentes: 1,
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
    const viewAposAusencia = await prisma.$queryRaw<
      Array<{ diasPresentes: bigint; fator: number }>
    >(Prisma.sql`
      SELECT dias_presentes AS "diasPresentes", fator
      FROM vw_participante_fator
      WHERE id_evento = ${eventoId} AND id_participante = ${participanteId}
    `);
    expect(Number(viewAposAusencia[0].diasPresentes)).toBe(0);
    expect(Number(viewAposAusencia[0].fator)).toBe(0);
  });

  it('rejeita payload inválido e recursos de outro evento', async () => {
    const eventoInexistente = await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/dias/999999/presencas')
      .auth(token, { type: 'bearer' })
      .expect(404);
    expect(eventoInexistente.body).toEqual({
      statusCode: 404,
      message: 'Evento não encontrado',
      error: 'Not Found',
    });

    const getDiaDeOutroEvento = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${outroDiaId}/presencas`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    expect(getDiaDeOutroEvento.body).toEqual({
      statusCode: 404,
      message: 'Dia não encontrado neste evento',
      error: 'Not Found',
    });

    const antes = await prisma.presenca.count({
      where: { diaId: dia1Id, participanteId },
    });
    const corposInvalidos: Array<Record<string, unknown> | undefined> = [
      undefined,
      {},
      { presente: 'sim' },
      { presente: true, campoExtra: 'não permitido' },
    ];
    for (const corpo of corposInvalidos) {
      const chamada = request(app.getHttpServer())
        .put(
          `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
        )
        .auth(token, { type: 'bearer' });
      if (corpo !== undefined) chamada.send(corpo);
      const resposta = await chamada.expect(400);
      expect(resposta.body.statusCode).toBe(400);
      expect(resposta.body.error).toBe('Bad Request');
      expect(Array.isArray(resposta.body.message)).toBe(true);
      expect(resposta.body.message.length).toBeGreaterThan(0);
      await expect(
        prisma.presenca.count({ where: { diaId: dia1Id, participanteId } }),
      ).resolves.toBe(antes);
    }

    const jsonMalformado = await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'application/json')
      .send('{"presente":')
      .expect(400);
    expect(jsonMalformado.headers['content-type']).toMatch(/application\/json/);
    expect(jsonMalformado.body.statusCode).toBe(400);
    expect(jsonMalformado.body.error).toBe('Bad Request');
    await expect(
      prisma.presenca.count({ where: { diaId: dia1Id, participanteId } }),
    ).resolves.toBe(antes);

    const participanteNaoEncontrado = await request(app.getHttpServer())
      .put(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/999999`)
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
    expect(participanteNaoEncontrado.body).toEqual({
      statusCode: 404,
      message: 'Participante não encontrado neste evento',
      error: 'Not Found',
    });
    await expect(
      prisma.presenca.count({ where: { diaId: dia1Id, participanteId } }),
    ).resolves.toBe(antes);
    const filtroSemCorrespondencia = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas`)
      .auth(token, { type: 'bearer' })
      .query({ grupoId: 999999 })
      .expect(200);
    expect(filtroSemCorrespondencia.body).toEqual({
      dados: [],
      resumo: { total: 0, presentes: 0, ausentes: 0 },
    });

    await prisma.presenca.upsert({
      where: {
        diaId_participanteId: { diaId: dia1Id, participanteId },
      },
      create: {
        eventoId,
        diaId: dia1Id,
        participanteId,
        presente: true,
      },
      update: { presente: true },
    });
    await prisma.presenca.upsert({
      where: {
        diaId_participanteId: {
          diaId: outroDiaId,
          participanteId: outroParticipanteId,
        },
      },
      create: {
        eventoId: outroEventoId,
        diaId: outroDiaId,
        participanteId: outroParticipanteId,
        presente: false,
      },
      update: { presente: false },
    });
    const presencaEvento = await prisma.presenca.findUnique({
      where: {
        diaId_participanteId: { diaId: dia1Id, participanteId },
      },
    });
    const presencaOutroEvento = await prisma.presenca.findUnique({
      where: {
        diaId_participanteId: {
          diaId: outroDiaId,
          participanteId: outroParticipanteId,
        },
      },
    });
    const quantidadeEventoAntes = await prisma.presenca.count({
      where: { eventoId },
    });
    const quantidadeOutroEventoAntes = await prisma.presenca.count({
      where: { eventoId: outroEventoId },
    });

    const participanteDeOutroEvento = await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${dia1Id}/presencas/${outroParticipanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
    expect(participanteDeOutroEvento.body).toEqual({
      statusCode: 404,
      message: 'Participante não encontrado neste evento',
      error: 'Not Found',
    });
    const diaInexistente = await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/999999/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
    expect(diaInexistente.body).toEqual({
      statusCode: 404,
      message: 'Dia não encontrado neste evento',
      error: 'Not Found',
    });
    const diaDeOutroEvento = await request(app.getHttpServer())
      .put(
        `/api/v1/eventos/${eventoId}/dias/${outroDiaId}/presencas/${participanteId}`,
      )
      .auth(token, { type: 'bearer' })
      .send({ presente: true })
      .expect(404);
    expect(diaDeOutroEvento.body).toEqual({
      statusCode: 404,
      message: 'Dia não encontrado neste evento',
      error: 'Not Found',
    });

    expect(
      await prisma.presenca.findUnique({
        where: {
          diaId_participanteId: { diaId: dia1Id, participanteId },
        },
      }),
    ).toEqual(presencaEvento);
    expect(
      await prisma.presenca.findUnique({
        where: {
          diaId_participanteId: {
            diaId: outroDiaId,
            participanteId: outroParticipanteId,
          },
        },
      }),
    ).toEqual(presencaOutroEvento);
    await expect(prisma.presenca.count({ where: { eventoId } })).resolves.toBe(
      quantidadeEventoAntes,
    );
    await expect(
      prisma.presenca.count({ where: { eventoId: outroEventoId } }),
    ).resolves.toBe(quantidadeOutroEventoAntes);
  });
});
