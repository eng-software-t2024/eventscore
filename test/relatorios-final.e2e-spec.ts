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
      await prisma.usuario.delete({ where: { id: adminId } });
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
});
