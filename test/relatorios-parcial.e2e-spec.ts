import { limparUsuariosAuthTeste } from './helpers/limpar-usuarios-auth-teste.js';
import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { TipoCriterioDesempate } from '../src/common/enums/tipo-criterio-desempate.enum.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const binaryParser = (
  res: request.Response,
  callback: (err: Error | null, data: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
};

describe('Relatório Parcial por Grupo E2E com PostgreSQL real (#228)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: number | undefined;
  let eventoId: number | undefined;
  let token: string;

  const email = `t228-${randomUUID()}@example.test`;
  const senha = 'senha-exclusiva-integracao-t228';

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
        nome: 'Administrador T228',
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
        nome: 'Arena Comp 2026',
        ano: 2097,
        dataInicio: new Date('2097-11-20T00:00:00.000Z'),
        dataFim: new Date('2097-11-22T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventoId = evento.id;

    const dia1 = await prisma.diaEvento.create({
      data: {
        eventoId: evento.id,
        numeroDia: 1,
        data: new Date('2097-11-20T00:00:00.000Z'),
      },
    });

    const [alfa, beta, gama, delta] = await Promise.all([
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: 'Alfa', cor: '#FF5733' },
      }),
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: 'Beta', cor: '#3380FF' },
      }),
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: 'Gama', cor: '#15803D' },
      }),
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: 'Delta', cor: '#B7791F' },
      }),
    ]);

    const desafioLancado = await prisma.desafio.create({
      data: {
        eventoId: evento.id,
        diaId: dia1.id,
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

    await prisma.desafio.create({
      data: {
        eventoId: evento.id,
        diaId: dia1.id,
        nome: 'Desafio Pendente',
        pontosColocacao: {
          create: [{ colocacao: 1, pontos: 100 }],
        },
      },
    });

    await prisma.resultadoDesafio.createMany({
      data: [
        {
          eventoId: evento.id,
          desafioId: desafioLancado.id,
          grupoId: alfa.id,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId: evento.id,
          desafioId: desafioLancado.id,
          grupoId: beta.id,
          colocacao: 2,
          ausente: false,
        },
        {
          eventoId: evento.id,
          desafioId: desafioLancado.id,
          grupoId: gama.id,
          colocacao: 3,
          ausente: false,
        },
        {
          eventoId: evento.id,
          desafioId: desafioLancado.id,
          grupoId: delta.id,
          colocacao: null,
          ausente: true,
        },
      ],
    });

    const itemBonus = await prisma.itemBonificacao.create({
      data: {
        eventoId: evento.id,
        nome: 'Uniformização',
        teto: 30,
      },
    });

    await prisma.bonificacaoGrupo.createMany({
      data: [
        { itemBonificacaoId: itemBonus.id, grupoId: alfa.id, valor: 20 },
        { itemBonificacaoId: itemBonus.id, grupoId: beta.id, valor: 15 },
        { itemBonificacaoId: itemBonus.id, grupoId: gama.id, valor: 5 },
      ],
    });

    await prisma.penalidade.create({
      data: {
        grupoId: beta.id,
        pontos: 10,
        descricao: 'Atraso',
        justificativa: 'Atraso na entrega',
      },
    });

    await prisma.criterioDesempate.create({
      data: {
        eventoId: evento.id,
        ordem: 1,
        tipo: TipoCriterioDesempate.MAIOR_BONIFICACAO,
        descricao: 'Maior bonificação',
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && eventoId !== undefined) {
        const gruposEvento = await prisma.grupo.findMany({
          where: { eventoId },
          select: { id: true },
        });
        const grupoIds = gruposEvento.map((g) => g.id);
        const desafiosEvento = await prisma.desafio.findMany({
          where: { eventoId },
          select: { id: true },
        });
        const desafioIds = desafiosEvento.map((d) => d.id);

        await prisma.$transaction([
          prisma.desempateManual.deleteMany({ where: { eventoId } }),
          prisma.apuracaoCriterio.deleteMany({
            where: { criterioDesempate: { eventoId } },
          }),
          prisma.classificacaoGrupo.deleteMany({ where: { eventoId } }),
          prisma.apuracaoResultadoDesafio.deleteMany({
            where: { desafioId: { in: desafioIds } },
          }),
          prisma.apuracao.deleteMany({ where: { eventoId } }),
          prisma.criterioDesempate.deleteMany({ where: { eventoId } }),
          prisma.bonificacaoGrupo.deleteMany({
            where: { grupoId: { in: grupoIds } },
          }),
          prisma.itemBonificacao.deleteMany({ where: { eventoId } }),
          prisma.penalidade.deleteMany({
            where: { grupoId: { in: grupoIds } },
          }),
          prisma.resultadoDesafio.deleteMany({ where: { eventoId } }),
          prisma.pontosColocacao.deleteMany({
            where: { desafioId: { in: desafioIds } },
          }),
          prisma.desafio.deleteMany({ where: { eventoId } }),
          prisma.grupo.deleteMany({ where: { eventoId } }),
          prisma.diaEvento.deleteMany({ where: { eventoId } }),
          prisma.evento.deleteMany({ where: { id: eventoId } }),
        ]);
      }
      if (prisma && adminId !== undefined) {
        await limparUsuariosAuthTeste(prisma, [adminId]);
      }
    } finally {
      await app?.close();
    }
  });

  it('rejeita requisição sem token com 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/parcial?formato=PDF`)
      .expect(401, {
        statusCode: 401,
        message: 'Token ausente ou inválido',
        error: 'Unauthorized',
      });
  });

  it('rejeita formato ausente ou inválido com 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/parcial?formato=CSV`)
      .auth(token, { type: 'bearer' })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });

  it('retorna 404 Not Found para evento inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/relatorios/parcial?formato=PDF')
      .auth(token, { type: 'bearer' })
      .expect(404, {
        statusCode: 404,
        message: 'Evento não encontrado',
        error: 'Not Found',
      });
  });

  it('exporta o relatório parcial em PDF (200 OK) com cabeçalhos e binário %PDF-', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/parcial?formato=PDF`)
      .auth(token, { type: 'bearer' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(
      'attachment; filename="relatorio-parcial-arena-comp-2026.pdf"',
    );
    const buffer = Buffer.from(res.body);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('exporta o relatório parcial em XLSX (200 OK) com cálculo real, desempate por critério e colunas do handoff', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/parcial?formato=XLSX`)
      .auth(token, { type: 'bearer' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain(
      'attachment; filename="relatorio-parcial-arena-comp-2026.xlsx"',
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(res.body) as unknown as ExcelJS.Buffer,
    );
    const sheet = workbook.getWorksheet('Relatório Parcial');
    expect(sheet).toBeDefined();

    expect(sheet?.getRow(1).getCell(1).value).toBe('Arena Comp 2026');
    expect(sheet?.getRow(3).getCell(1).value).toBe('1 de 2 desafios lançados');

    // Beta (80 + 15 - 10 = 85) e Gama (80 + 5 - 0 = 85) empatam em total=85,
    // mas Beta vence Gama no critério 1 (MAIOR_BONIFICACAO: 15 > 5).
    expect(
      [1, 2, 3, 4, 5, 6].map((c) => sheet?.getRow(7).getCell(c).value),
    ).toEqual(['1º', 'Alfa', 100, 20, 0, 120]);
    expect(
      [1, 2, 3, 4, 5, 6].map((c) => sheet?.getRow(8).getCell(c).value),
    ).toEqual(['2º', 'Beta', 80, 15, 10, 85]);
    expect(
      [1, 2, 3, 4, 5, 6].map((c) => sheet?.getRow(9).getCell(c).value),
    ).toEqual(['3º', 'Gama', 80, 5, 0, 85]);
    expect(
      [1, 2, 3, 4, 5, 6].map((c) => sheet?.getRow(10).getCell(c).value),
    ).toEqual(['4º', 'Delta', 0, 0, 0, 0]);
  });
});
