import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const binaryParser = (
  res: request.Response,
  callback: (err: Error | null, data: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Relatório Final por Participante E2E (#229)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventoId: number;
  let adminId: number;
  let token: string;
  const email = `t229-${randomUUID()}@example.test`;
  const senha = 'senha-exclusiva-integracao-t229';

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

    const admin = await prisma.usuario.create({
      data: {
        nome: 'Administrador T229',
        email,
        perfil: 'ADMIN',
        ativo: true,
        senhaHash: await app.get(PasswordHashService).hash(senha),
      },
    });
    adminId = admin.id;
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = login.body.token;

    const evento = await prisma.evento.create({
      data: {
        nome: 'Arena Final T229',
        ano: 2096,
        dataInicio: new Date('2096-11-20T00:00:00.000Z'),
        dataFim: new Date('2096-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventoId = evento.id;
    const [dia1, dia2] = await Promise.all([
      prisma.diaEvento.create({
        data: {
          eventoId,
          numeroDia: 1,
          data: new Date('2096-11-20T00:00:00.000Z'),
        },
      }),
      prisma.diaEvento.create({
        data: {
          eventoId,
          numeroDia: 2,
          data: new Date('2096-11-21T00:00:00.000Z'),
        },
      }),
    ]);
    const [alfa, beta] = await Promise.all([
      prisma.grupo.create({ data: { eventoId, nome: 'Alfa', cor: '#112233' } }),
      prisma.grupo.create({ data: { eventoId, nome: 'Beta', cor: '#445566' } }),
    ]);
    const [ana, bruna] = await Promise.all([
      prisma.participante.create({
        data: {
          eventoId,
          grupoId: alfa.id,
          nome: 'Ana Final',
          matricula: 'T229-A',
          turma: 'A',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId,
          grupoId: beta.id,
          nome: 'Bruna Final',
          matricula: 'T229-B',
          turma: 'B',
        },
      }),
    ]);
    const desafio = await prisma.desafio.create({
      data: {
        eventoId,
        diaId: dia1.id,
        nome: 'Desafio final',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        },
      },
    });
    await prisma.resultadoDesafio.createMany({
      data: [
        {
          eventoId,
          desafioId: desafio.id,
          grupoId: alfa.id,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId,
          desafioId: desafio.id,
          grupoId: beta.id,
          colocacao: 2,
          ausente: false,
        },
      ],
    });
    await prisma.fatorPresenca.createMany({
      data: [
        { eventoId, diasPresentes: 0, fator: 0 },
        { eventoId, diasPresentes: 1, fator: 0.5 },
        { eventoId, diasPresentes: 2, fator: 1 },
      ],
    });
    await prisma.conversaoPontoExtra.createMany({
      data: [
        { eventoId, colocacao: 1, pontoExtra: 1 },
        { eventoId, colocacao: 2, pontoExtra: 0.8 },
      ],
    });
    await prisma.presenca.create({
      data: {
        eventoId,
        diaId: dia1.id,
        participanteId: ana.id,
        presente: true,
      },
    });
    void bruna;
    void dia2;
  });

  afterAll(async () => {
    if (prisma && eventoId) {
      const desafios = await prisma.desafio.findMany({
        where: { eventoId },
        select: { id: true },
      });
      await prisma.presenca.deleteMany({ where: { eventoId } });
      await prisma.fatorPresenca.deleteMany({ where: { eventoId } });
      await prisma.conversaoPontoExtra.deleteMany({ where: { eventoId } });
      await prisma.resultadoDesafio.deleteMany({ where: { eventoId } });
      await prisma.pontosColocacao.deleteMany({
        where: { desafioId: { in: desafios.map((item) => item.id) } },
      });
      await prisma.desafio.deleteMany({ where: { eventoId } });
      await prisma.participante.deleteMany({ where: { eventoId } });
      await prisma.diaEvento.deleteMany({ where: { eventoId } });
      await prisma.grupo.deleteMany({ where: { eventoId } });
      await prisma.evento.delete({ where: { id: eventoId } });
    }
    await app?.close();
  });

  it('protege a prévia e retorna dias, ausências, busca e ponto extra', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/final/previa`)
      .expect(401);
    const resposta = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/final/previa?busca=Ana`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(resposta.body).toEqual([
      {
        turma: 'A',
        totalParticipantes: 1,
        participantes: [
          expect.objectContaining({
            matricula: 'T229-A',
            pontoExtra: 0.5,
            presencas: [
              { numeroDia: 1, presente: true },
              { numeroDia: 2, presente: false },
            ],
          }),
        ],
      },
    ]);
  });

  it('exporta PDF e XLSX usando os exportadores compartilhados', async () => {
    for (const formato of ['PDF', 'XLSX']) {
      const resposta = await request(app.getHttpServer())
        .get(`/api/v1/eventos/${eventoId}/relatorios/final?formato=${formato}`)
        .auth(token, { type: 'bearer' })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      expect(resposta.headers['content-disposition']).toContain(
        'relatorio-final-arena-final-t229',
      );
      expect(Buffer.from(resposta.body).length).toBeGreaterThan(0);
    }
  });

  it('bloqueia empate pendente e libera as três rotas após desempate vigente', async () => {
    const eventoEmpate = await prisma.evento.create({
      data: {
        nome: 'Arena Empate T229',
        ano: 2095,
        dataInicio: new Date('2095-11-20T00:00:00.000Z'),
        dataFim: new Date('2095-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    const [dia1, dia2] = await Promise.all([
      prisma.diaEvento.create({
        data: {
          eventoId: eventoEmpate.id,
          numeroDia: 1,
          data: new Date('2095-11-20T00:00:00.000Z'),
        },
      }),
      prisma.diaEvento.create({
        data: {
          eventoId: eventoEmpate.id,
          numeroDia: 2,
          data: new Date('2095-11-21T00:00:00.000Z'),
        },
      }),
    ]);
    const [grupoAlfa, grupoBeta] = await Promise.all([
      prisma.grupo.create({
        data: {
          eventoId: eventoEmpate.id,
          nome: 'Alfa Empate',
          cor: '#AA1122',
        },
      }),
      prisma.grupo.create({
        data: {
          eventoId: eventoEmpate.id,
          nome: 'Beta Empate',
          cor: '#BB2233',
        },
      }),
    ]);
    const [participanteAlfa, participanteBeta] = await Promise.all([
      prisma.participante.create({
        data: {
          eventoId: eventoEmpate.id,
          grupoId: grupoAlfa.id,
          nome: 'Alfa Aluno',
          matricula: 'EMP-A',
          turma: 'A',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId: eventoEmpate.id,
          grupoId: grupoBeta.id,
          nome: 'Beta Aluno',
          matricula: 'EMP-B',
          turma: 'B',
        },
      }),
    ]);
    const desafio1 = await prisma.desafio.create({
      data: {
        eventoId: eventoEmpate.id,
        diaId: dia1.id,
        nome: 'Empate 1',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        },
      },
    });
    const desafio2 = await prisma.desafio.create({
      data: {
        eventoId: eventoEmpate.id,
        diaId: dia2.id,
        nome: 'Empate 2',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        },
      },
    });
    await prisma.resultadoDesafio.createMany({
      data: [
        {
          eventoId: eventoEmpate.id,
          desafioId: desafio1.id,
          grupoId: grupoAlfa.id,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId: eventoEmpate.id,
          desafioId: desafio1.id,
          grupoId: grupoBeta.id,
          colocacao: 2,
          ausente: false,
        },
        {
          eventoId: eventoEmpate.id,
          desafioId: desafio2.id,
          grupoId: grupoAlfa.id,
          colocacao: 2,
          ausente: false,
        },
        {
          eventoId: eventoEmpate.id,
          desafioId: desafio2.id,
          grupoId: grupoBeta.id,
          colocacao: 1,
          ausente: false,
        },
      ],
    });
    await prisma.fatorPresenca.createMany({
      data: [
        { eventoId: eventoEmpate.id, diasPresentes: 0, fator: 0 },
        { eventoId: eventoEmpate.id, diasPresentes: 1, fator: 0.5 },
        { eventoId: eventoEmpate.id, diasPresentes: 2, fator: 1 },
      ],
    });
    await prisma.conversaoPontoExtra.createMany({
      data: [
        { eventoId: eventoEmpate.id, colocacao: 1, pontoExtra: 1 },
        { eventoId: eventoEmpate.id, colocacao: 2, pontoExtra: 0.2 },
      ],
    });
    await prisma.presenca.createMany({
      data: [
        {
          eventoId: eventoEmpate.id,
          diaId: dia1.id,
          participanteId: participanteAlfa.id,
          presente: true,
        },
        {
          eventoId: eventoEmpate.id,
          diaId: dia2.id,
          participanteId: participanteAlfa.id,
          presente: true,
        },
        {
          eventoId: eventoEmpate.id,
          diaId: dia1.id,
          participanteId: participanteBeta.id,
          presente: true,
        },
      ],
    });

    try {
      const rotas = [
        `/api/v1/eventos/${eventoEmpate.id}/relatorios/final/previa`,
        `/api/v1/eventos/${eventoEmpate.id}/relatorios/final?formato=PDF`,
        `/api/v1/eventos/${eventoEmpate.id}/relatorios/final?formato=XLSX`,
      ];
      for (const rota of rotas) {
        await request(app.getHttpServer())
          .get(rota)
          .auth(token, { type: 'bearer' })
          .expect(409);
      }

      const apuracao = await prisma.apuracao.create({
        data: {
          eventoId: eventoEmpate.id,
          versao: 1,
          usuarioId: adminId,
          operacaoId: randomUUID(),
          status: 'PROVISORIA',
        },
      });
      await prisma.classificacaoGrupo.createMany({
        data: [
          {
            apuracaoId: apuracao.id,
            grupoId: grupoAlfa.id,
            eventoId: eventoEmpate.id,
            posicao: 2,
            pontosDesafios: 180,
            pontosTotal: 180,
          },
          {
            apuracaoId: apuracao.id,
            grupoId: grupoBeta.id,
            eventoId: eventoEmpate.id,
            posicao: 1,
            pontosDesafios: 180,
            pontosTotal: 180,
          },
        ],
      });
      await prisma.desempateManual.createMany({
        data: [
          {
            eventoId: eventoEmpate.id,
            grupoId: grupoAlfa.id,
            apuracaoId: apuracao.id,
            operacaoId: randomUUID(),
            posicao: 2,
            justificativa: 'Desempate manual T229',
            usuarioId: adminId,
          },
          {
            eventoId: eventoEmpate.id,
            grupoId: grupoBeta.id,
            apuracaoId: apuracao.id,
            operacaoId: randomUUID(),
            posicao: 1,
            justificativa: 'Desempate manual T229',
            usuarioId: adminId,
          },
        ],
      });

      const previa = await request(app.getHttpServer())
        .get(`/api/v1/eventos/${eventoEmpate.id}/relatorios/final/previa`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(previa.body[0].participantes[0]).toMatchObject({
        pontoExtra: 0.2,
      });
      expect(previa.body[1].participantes[0]).toMatchObject({
        pontoExtra: 0.5,
      });
      expect(previa.body[0].participantes[0].presencas).toEqual([
        { numeroDia: 1, presente: true },
        { numeroDia: 2, presente: true },
      ]);
      expect(previa.body[1].participantes[0].presencas).toEqual([
        { numeroDia: 1, presente: true },
        { numeroDia: 2, presente: false },
      ]);

      for (const rota of rotas.slice(1)) {
        await request(app.getHttpServer())
          .get(rota)
          .auth(token, { type: 'bearer' })
          .buffer(true)
          .parse(binaryParser)
          .expect(200);
      }
    } finally {
      // V11 torna desempate_manual append-only; o banco inteiro desta execução é descartável.
    }
  });
});
