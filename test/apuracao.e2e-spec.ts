import { limparUsuariosAuthTeste } from './helpers/limpar-usuarios-auth-teste.js';
import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Apuração individual HTTP com PostgreSQL (#261)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventId: number;
  let validationEventId: number;
  let groupAId: number;
  let groupBId: number;
  let token: string;
  const suffix = randomUUID();
  const email = `apuracao-${suffix}@example.test`;
  const password = 'senha-exclusiva-integracao-apuracao';

  const http = () => request(app.getHttpServer());
  const getResults = (query = '') =>
    http()
      .get(`/api/v1/eventos/${eventId}/apuracao${query}`)
      .set('Authorization', `Bearer ${token}`);

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
        nome: 'Administrador Apuração',
        email,
        perfil: 'ADMIN',
        ativo: true,
        senhaHash: await app.get(PasswordHashService).hash(password),
      },
    });
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, senha: password })
      .expect(200);
    token = login.body.token;

    const event = await prisma.evento.create({
      data: {
        nome: `Evento apuração ${suffix}`,
        ano: 2097,
        dataInicio: new Date('2097-11-20T00:00:00.000Z'),
        dataFim: new Date('2097-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventId = event.id;
    const [dayOne, dayTwo] = await Promise.all([
      prisma.diaEvento.create({
        data: {
          eventoId: eventId,
          numeroDia: 1,
          data: new Date('2097-11-20T00:00:00.000Z'),
        },
      }),
      prisma.diaEvento.create({
        data: {
          eventoId: eventId,
          numeroDia: 2,
          data: new Date('2097-11-21T00:00:00.000Z'),
        },
      }),
    ]);
    const [groupA, groupB] = await Promise.all([
      prisma.grupo.create({
        data: { eventoId: eventId, nome: 'Alfa', cor: '#112233' },
      }),
      prisma.grupo.create({
        data: { eventoId: eventId, nome: 'Beta', cor: '#445566' },
      }),
    ]);
    groupAId = groupA.id;
    groupBId = groupB.id;
    const [ana, bruna, caio] = await Promise.all([
      prisma.participante.create({
        data: {
          eventoId: eventId,
          grupoId: groupAId,
          nome: 'Ana',
          matricula: `A-${suffix.slice(0, 8)}`,
          turma: 'T1',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId: eventId,
          grupoId: groupBId,
          nome: 'Bruna',
          matricula: `B-${suffix.slice(0, 8)}`,
          turma: 'T1',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId: eventId,
          grupoId: groupBId,
          nome: 'Caio',
          matricula: `C-${suffix.slice(0, 8)}`,
          turma: 'T2',
        },
      }),
    ]);
    const challenge = await prisma.desafio.create({
      data: {
        eventoId: eventId,
        diaId: dayOne.id,
        nome: 'Desafio apuração',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 50 },
          ],
        },
      },
    });
    await prisma.resultadoDesafio.createMany({
      data: [
        {
          eventoId: eventId,
          desafioId: challenge.id,
          grupoId: groupAId,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId: eventId,
          desafioId: challenge.id,
          grupoId: groupBId,
          colocacao: 2,
          ausente: false,
        },
      ],
    });
    await prisma.conversaoPontoExtra.createMany({
      data: [
        { eventoId: eventId, colocacao: 1, pontoExtra: 0.9 },
        { eventoId: eventId, colocacao: 2, pontoExtra: 0.5 },
      ],
    });
    await prisma.fatorPresenca.createMany({
      data: [
        { eventoId: eventId, diasPresentes: 0, fator: 0 },
        { eventoId: eventId, diasPresentes: 1, fator: 0.75 },
        { eventoId: eventId, diasPresentes: 2, fator: 1 },
      ],
    });
    await prisma.presenca.createMany({
      data: [
        {
          eventoId: eventId,
          diaId: dayOne.id,
          participanteId: ana.id,
          presente: true,
        },
        {
          eventoId: eventId,
          diaId: dayTwo.id,
          participanteId: ana.id,
          presente: false,
        },
        {
          eventoId: eventId,
          diaId: dayOne.id,
          participanteId: bruna.id,
          presente: true,
        },
        {
          eventoId: eventId,
          diaId: dayTwo.id,
          participanteId: bruna.id,
          presente: true,
        },
        {
          eventoId: eventId,
          diaId: dayOne.id,
          participanteId: caio.id,
          presente: false,
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      for (const id of [validationEventId, eventId].filter(
        (value): value is number => value !== undefined,
      )) {
        await prisma.presenca.deleteMany({ where: { eventoId: id } });
        await prisma.resultadoDesafio.deleteMany({ where: { eventoId: id } });
        await prisma.pontosColocacao.deleteMany({
          where: { desafio: { eventoId: id } },
        });
        await prisma.desafio.deleteMany({ where: { eventoId: id } });
        await prisma.conversaoPontoExtra.deleteMany({
          where: { eventoId: id },
        });
        await prisma.fatorPresenca.deleteMany({ where: { eventoId: id } });
        await prisma.participante.deleteMany({ where: { eventoId: id } });
        await prisma.grupo.deleteMany({ where: { eventoId: id } });
        await prisma.diaEvento.deleteMany({ where: { eventoId: id } });
        await prisma.evento.delete({ where: { id } });
      }
      const testUsers = await prisma.usuario.findMany({
        where: { email },
        select: { id: true },
      });
      await limparUsuariosAuthTeste(
        prisma,
        testUsers.map((user) => user.id),
      );
    }
    await app?.close();
  });

  it('calcula ponto extra a partir da classificação e presença, com resumo anterior à paginação', async () => {
    const first = await getResults('?pagina=1&tamanho=2').expect(200);
    expect(first.body.paginacao).toEqual({
      pagina: 1,
      tamanho: 2,
      totalItens: 3,
      totalPaginas: 2,
    });
    expect(first.body.resumo).toEqual({
      totalParticipantes: 3,
      assiduidade: 0.5,
      aptos: 2,
    });
    expect(first.body.dados).toEqual([
      {
        participanteId: expect.any(Number),
        matricula: expect.any(String),
        nome: 'Ana',
        turma: 'T1',
        grupo: 'Alfa',
        colocacaoGrupo: 1,
        pontoExtraGrupo: 0.9,
        diasPresentes: 1,
        diasTotais: 2,
        fator: 0.75,
        pontoExtra: 0.68,
      },
      {
        participanteId: expect.any(Number),
        matricula: expect.any(String),
        nome: 'Bruna',
        turma: 'T1',
        grupo: 'Beta',
        colocacaoGrupo: 2,
        pontoExtraGrupo: 0.5,
        diasPresentes: 2,
        diasTotais: 2,
        fator: 1,
        pontoExtra: 0.5,
      },
    ]);
    const second = await getResults('?pagina=2&tamanho=2').expect(200);
    expect(second.body.dados[0]).toMatchObject({
      nome: 'Caio',
      diasPresentes: 0,
      fator: 0,
      pontoExtra: 0,
    });
    expect(second.body.resumo).toEqual(first.body.resumo);
  });

  it('filtra por grupo, turma, nome e matrícula antes do resumo', async () => {
    const group = await getResults(
      `?grupoId=${groupBId}&turma=T1&busca=bru`,
    ).expect(200);
    expect(group.body.dados.map((row: { nome: string }) => row.nome)).toEqual([
      'Bruna',
    ]);
    expect(group.body.resumo).toEqual({
      totalParticipantes: 1,
      assiduidade: 1,
      aptos: 1,
    });
    const registration = await getResults(
      `?busca=B-${suffix.slice(0, 8)}`,
    ).expect(200);
    expect(registration.body.dados[0].nome).toBe('Bruna');
    const empty = await getResults(`?grupoId=${groupAId}&turma=T2`).expect(200);
    expect(empty.body.resumo).toEqual({
      totalParticipantes: 0,
      assiduidade: 0,
      aptos: 0,
    });
  });

  it('recusa token ausente ou inválido, parâmetros inválidos e evento inexistente', async () => {
    await http().get(`/api/v1/eventos/${eventId}/apuracao`).expect(401);
    await http()
      .get(`/api/v1/eventos/${eventId}/apuracao`)
      .set('Authorization', 'Bearer invalido')
      .expect(401);
    await getResults('?pagina=0').expect(400);
    await getResults('?tamanho=101').expect(400);
    await getResults('?grupoId=abc').expect(400);
    await http()
      .get('/api/v1/eventos/abc/apuracao')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await http()
      .get('/api/v1/eventos/2147483647/apuracao')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('bloqueia evento incompleto, configuração incompleta e empate em fixture isolada', async () => {
    const validationEvent = await prisma.evento.create({
      data: {
        nome: `Evento validação apuração ${suffix}`,
        ano: 2097,
        dataInicio: new Date('2097-11-20T00:00:00.000Z'),
        dataFim: new Date('2097-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    validationEventId = validationEvent.id;
    const getValidation = () =>
      http()
        .get(`/api/v1/eventos/${validationEventId}/apuracao`)
        .set('Authorization', `Bearer ${token}`);
    expect((await getValidation().expect(409)).body.message).toContain(
      'não possui grupos',
    );

    const [firstGroup, secondGroup] = await Promise.all([
      prisma.grupo.create({
        data: { eventoId: validationEventId, nome: 'Primeiro', cor: '#123456' },
      }),
      prisma.grupo.create({
        data: { eventoId: validationEventId, nome: 'Segundo', cor: '#654321' },
      }),
    ]);
    expect((await getValidation().expect(409)).body.message).toContain(
      'não possui desafios',
    );
    const day = await prisma.diaEvento.create({
      data: {
        eventoId: validationEventId,
        numeroDia: 1,
        data: new Date('2097-11-20T00:00:00.000Z'),
      },
    });
    const challenge = await prisma.desafio.create({
      data: {
        eventoId: validationEventId,
        diaId: day.id,
        nome: 'Desafio de validação',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 50 },
          ],
        },
      },
    });
    await prisma.resultadoDesafio.create({
      data: {
        eventoId: validationEventId,
        desafioId: challenge.id,
        grupoId: firstGroup.id,
        colocacao: 1,
        ausente: false,
      },
    });
    expect((await getValidation().expect(409)).body.message).toContain(
      'resultados pendentes',
    );
    await prisma.resultadoDesafio.create({
      data: {
        eventoId: validationEventId,
        desafioId: challenge.id,
        grupoId: secondGroup.id,
        colocacao: 2,
        ausente: false,
      },
    });
    expect((await getValidation().expect(409)).body.message).toContain(
      'conversão da 1ª',
    );
    await prisma.conversaoPontoExtra.createMany({
      data: [
        { eventoId: validationEventId, colocacao: 1, pontoExtra: 0.9 },
        { eventoId: validationEventId, colocacao: 2, pontoExtra: 0.5 },
      ],
    });
    expect((await getValidation().expect(409)).body.message).toContain(
      'fator para 0 dias presentes',
    );
    await prisma.fatorPresenca.createMany({
      data: [
        { eventoId: validationEventId, diasPresentes: 0, fator: 0 },
        { eventoId: validationEventId, diasPresentes: 1, fator: 0.5 },
        { eventoId: validationEventId, diasPresentes: 2, fator: 1 },
      ],
    });
    await getValidation().expect(200);
    await prisma.pontosColocacao.updateMany({
      where: { desafioId: challenge.id, colocacao: 2 },
      data: { pontos: 100 },
    });
    expect((await getValidation().expect(409)).body.message).toContain(
      'empate pendente',
    );
  });

  it('publica o contrato da apuração e exige Bearer no Swagger gerado', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation =
      document.paths[`/api/v1/eventos/{eventoId}/apuracao`]?.get;
    expect(operation).toBeDefined();
    expect(operation?.security).toEqual([{ bearer: [] }]);
    expect(operation?.responses?.['200']).toBeDefined();
    expect(operation?.responses?.['400']).toBeDefined();
    expect(operation?.responses?.['401']).toBeDefined();
    expect(operation?.responses?.['404']).toBeDefined();
    expect(operation?.responses?.['409']).toBeDefined();
    expect(document.components?.schemas?.ApuracaoEnvelopeDto).toBeDefined();
    expect(
      document.components?.schemas?.LinhaApuracaoParticipanteDto,
    ).toBeDefined();
  });
});
