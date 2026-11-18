import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { RelatorioParcialService } from '../src/modules/relatorios/parcial/relatorio-parcial.service.js';
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
  const createdEventIds = new Set<number>();
  const eventosPreservadosAteDescarte = new Set<number>();
  const fixtureRunId = randomUUID();
  const nomeEventoRelatorio = `Arena Final T229 ${fixtureRunId}`;
  const nomeEventoEmpate = `Arena Empate T229 ${fixtureRunId}`;
  const nomeAna = 'Ana Final';
  const nomeBruna = 'Bruna Final';
  const matriculaAna = 'T229-A';
  const matriculaBruna = 'T229-B';
  const matriculaEmpateAlfa = 'EMP-A';
  const matriculaEmpateBeta = 'EMP-B';
  const turmaAna = 'A';
  const turmaBruna = 'X';
  const termoBuscaNome = 'Ana';
  const termoBuscaMatricula = matriculaAna;
  const termoBuscaTurma = turmaBruna;
  const termoBuscaSemResultado = 'sem-correspondencia';
  const participantesPesquisaveis = [
    { nome: nomeAna, matricula: matriculaAna, turma: turmaAna },
    { nome: nomeBruna, matricula: matriculaBruna, turma: turmaBruna },
  ];
  const camposPesquisaveis = ['nome', 'matricula', 'turma'] as const;
  const ocorrenciasDoTermo = (termo: string) =>
    participantesPesquisaveis.flatMap((participante) =>
      camposPesquisaveis
        .filter((campo) =>
          participante[campo]
            .toLocaleLowerCase('pt-BR')
            .includes(termo.toLocaleLowerCase('pt-BR')),
        )
        .map((campo) => ({ matricula: participante.matricula, campo })),
    );
  type GrupoPrevia = {
    turma: string;
    participantes: Array<{ matricula: string }>;
  };
  const matriculasRetornadas = (previa: GrupoPrevia[]) =>
    previa.flatMap((grupo) => grupo.participantes.map((p) => p.matricula));
  const turmasRetornadas = (previa: GrupoPrevia[]) =>
    previa.map((grupo) => grupo.turma);
  const email = `t229-${fixtureRunId}@example.test`;
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
        nome: nomeEventoRelatorio,
        ano: 2096,
        dataInicio: new Date('2096-11-20T00:00:00.000Z'),
        dataFim: new Date('2096-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventoId = evento.id;
    createdEventIds.add(evento.id);
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
          nome: nomeAna,
          matricula: matriculaAna,
          turma: turmaAna,
        },
      }),
      prisma.participante.create({
        data: {
          eventoId,
          grupoId: beta.id,
          nome: nomeBruna,
          matricula: matriculaBruna,
          turma: turmaBruna,
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
    try {
      if (prisma) {
        for (const eventoIdParaLimpar of createdEventIds) {
          // V11 protege os desempates e referencia evento, grupo, apuração e usuário.
          // A fixture de empate e o administrador ficam até descartar o banco.
          if (eventosPreservadosAteDescarte.has(eventoIdParaLimpar)) continue;

          const desafios = await prisma.desafio.findMany({
            where: { eventoId: eventoIdParaLimpar },
            select: { id: true },
          });
          await prisma.presenca.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.fatorPresenca.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.conversaoPontoExtra.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.resultadoDesafio.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.pontosColocacao.deleteMany({
            where: { desafioId: { in: desafios.map((item) => item.id) } },
          });
          await prisma.desafio.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.participante.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.diaEvento.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.grupo.deleteMany({
            where: { eventoId: eventoIdParaLimpar },
          });
          await prisma.evento.delete({ where: { id: eventoIdParaLimpar } });
        }
      }
    } finally {
      await app?.close();
    }
  });

  it('protege a prévia e retorna dias, ausências, busca e ponto extra', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/final/previa`)
      .expect(401);
    const resposta = await request(app.getHttpServer())
      .get(
        `/api/v1/eventos/${eventoId}/relatorios/final/previa?busca=${termoBuscaNome}`,
      )
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(resposta.body).toEqual([
      {
        turma: turmaAna,
        totalParticipantes: 1,
        participantes: [
          expect.objectContaining({
            matricula: matriculaAna,
            pontoExtra: 0.5,
            presencas: [
              { numeroDia: 1, presente: true },
              { numeroDia: 2, presente: false },
            ],
          }),
        ],
      },
    ]);

    expect(ocorrenciasDoTermo(termoBuscaNome)).toEqual([
      { matricula: matriculaAna, campo: 'nome' },
    ]);
    expect(ocorrenciasDoTermo(termoBuscaMatricula)).toEqual([
      { matricula: matriculaAna, campo: 'matricula' },
    ]);
    expect(ocorrenciasDoTermo(termoBuscaTurma)).toEqual([
      { matricula: matriculaBruna, campo: 'turma' },
    ]);
    expect(ocorrenciasDoTermo(termoBuscaSemResultado)).toEqual([]);
    expect(matriculasRetornadas(resposta.body)).toEqual([matriculaAna]);

    const porMatricula = await request(app.getHttpServer())
      .get(
        `/api/v1/eventos/${eventoId}/relatorios/final/previa?busca=${termoBuscaMatricula}`,
      )
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(matriculasRetornadas(porMatricula.body)).toEqual([matriculaAna]);
    expect(turmasRetornadas(porMatricula.body)).toEqual([turmaAna]);

    const porTurma = await request(app.getHttpServer())
      .get(
        `/api/v1/eventos/${eventoId}/relatorios/final/previa?busca=${termoBuscaTurma}`,
      )
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(turmasRetornadas(porTurma.body)).toEqual([turmaBruna]);
    expect(matriculasRetornadas(porTurma.body)).toEqual([matriculaBruna]);
    expect(typeof resposta.body[0].participantes[0].pontoExtra).toBe('number');

    const semResultado = await request(app.getHttpServer())
      .get(
        `/api/v1/eventos/${eventoId}/relatorios/final/previa?busca=${termoBuscaSemResultado}`,
      )
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(semResultado.body).toEqual([]);
  });

  it('protege a exportação, valida o formato e retorna 404 para evento inexistente', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/final?formato=PDF`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/final?formato=PDF`)
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/relatorios/final/previa')
      .auth(token, { type: 'bearer' })
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/eventos/999999/relatorios/final?formato=PDF')
      .auth(token, { type: 'bearer' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${eventoId}/relatorios/final?formato=CSV`)
      .auth(token, { type: 'bearer' })
      .expect(400);

    for (const rota of [
      `/api/v1/eventos/${eventoId}/relatorios/final`,
      `/api/v1/eventos/${eventoId}/relatorios/final?formato=pdf`,
      '/api/v1/eventos/abc/relatorios/final?formato=PDF',
      '/api/v1/eventos/abc/relatorios/final/previa',
    ]) {
      await request(app.getHttpServer())
        .get(rota)
        .auth(token, { type: 'bearer' })
        .expect(400);
    }
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
        `relatorio-final-arena-final-t229-${fixtureRunId}`,
      );
      expect(resposta.headers['content-type']).toMatch(
        formato === 'PDF'
          ? /^application\/pdf/
          : /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      );
      const buffer = Buffer.from(resposta.body);
      expect(buffer.length).toBeGreaterThan(0);
      expect(
        formato === 'PDF'
          ? buffer.subarray(0, 5).toString('ascii')
          : buffer.subarray(0, 2).toString('ascii'),
      ).toBe(formato === 'PDF' ? '%PDF-' : 'PK');

      if (formato === 'XLSX') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
        expect(workbook.worksheets).toHaveLength(1);
        const worksheet = workbook.worksheets[0];
        const valoresDaLinha = (numero: number) =>
          Array.from(
            { length: 7 },
            (_, indice) => worksheet.getRow(numero).getCell(indice + 1).value,
          );
        expect(worksheet.name).toBe('Relatório Final');
        expect(valoresDaLinha(5)).toEqual([
          'Turma',
          'Matrícula',
          'Nome',
          'Grupo',
          'Dia 1',
          'Dia 2',
          'Ponto extra',
        ]);
        expect(valoresDaLinha(6)).toEqual([
          turmaAna,
          matriculaAna,
          nomeAna,
          'Alfa',
          'Presente',
          'Ausente',
          0.5,
        ]);
        expect(valoresDaLinha(7)).toEqual([
          turmaBruna,
          matriculaBruna,
          nomeBruna,
          'Beta',
          'Ausente',
          'Ausente',
          0,
        ]);
      }
    }
  });

  // Caracterização do comportamento atual; não afirma conformidade com uma regra de completude.
  it('caracteriza prévia e exportações com um de dois desafios lançado, sem empate', async () => {
    const evento = await prisma.evento.create({
      data: {
        nome: `Arena RF17 Final ${fixtureRunId}`,
        ano: 2094,
        dataInicio: new Date('2094-11-20T00:00:00.000Z'),
        dataFim: new Date('2094-11-24T00:00:00.000Z'),
        quantidadeDias: 5,
        ativo: false,
      },
    });
    createdEventIds.add(evento.id);

    const dias = await Promise.all(
      Array.from({ length: 5 }, (_, indice) =>
        prisma.diaEvento.create({
          data: {
            eventoId: evento.id,
            numeroDia: indice + 1,
            data: new Date(Date.UTC(2094, 10, 20 + indice)),
          },
        }),
      ),
    );
    const [alfa, beta] = await Promise.all([
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: 'Alfa', cor: '#112233' },
      }),
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: 'Beta', cor: '#445566' },
      }),
    ]);
    const nomeZelia = `Zélia ${'de Ávila '.repeat(16)}`;
    const matriculaLonga = 'T229-C-0000000000001';
    expect(nomeZelia).toHaveLength(150);
    expect(matriculaLonga).toHaveLength(20);
    const [mateus, zelia] = await Promise.all([
      prisma.participante.create({
        data: {
          eventoId: evento.id,
          grupoId: alfa.id,
          nome: 'Mateus Azevedo',
          matricula: 'T229-A',
          turma: 'A-26',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId: evento.id,
          grupoId: beta.id,
          nome: nomeZelia,
          matricula: matriculaLonga,
          turma: 'TURMA-2026',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId: evento.id,
          grupoId: beta.id,
          nome: 'Ágata do Ó',
          matricula: 'T229-D',
          turma: 'TURMA-2026',
        },
      }),
    ]);
    const [lancado, semResultado] = await Promise.all([
      prisma.desafio.create({
        data: {
          eventoId: evento.id,
          diaId: dias[0].id,
          nome: 'Desafio lançado',
          pontosColocacao: {
            create: [
              { colocacao: 1, pontos: 100 },
              { colocacao: 2, pontos: 80 },
            ],
          },
        },
      }),
      prisma.desafio.create({
        data: {
          eventoId: evento.id,
          diaId: dias[1].id,
          nome: 'Desafio sem resultado',
          pontosColocacao: {
            create: [
              { colocacao: 1, pontos: 100 },
              { colocacao: 2, pontos: 80 },
            ],
          },
        },
      }),
    ]);
    await prisma.resultadoDesafio.createMany({
      data: [
        {
          eventoId: evento.id,
          desafioId: lancado.id,
          grupoId: alfa.id,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId: evento.id,
          desafioId: lancado.id,
          grupoId: beta.id,
          colocacao: 2,
          ausente: false,
        },
      ],
    });
    await prisma.fatorPresenca.createMany({
      data: [
        { eventoId: evento.id, diasPresentes: 0, fator: 0 },
        { eventoId: evento.id, diasPresentes: 1, fator: 0.2 },
        { eventoId: evento.id, diasPresentes: 2, fator: 0.4 },
        { eventoId: evento.id, diasPresentes: 3, fator: 0.6 },
        { eventoId: evento.id, diasPresentes: 4, fator: 0.8 },
        { eventoId: evento.id, diasPresentes: 5, fator: 1 },
      ],
    });
    await prisma.conversaoPontoExtra.createMany({
      data: [
        { eventoId: evento.id, colocacao: 1, pontoExtra: 1 },
        { eventoId: evento.id, colocacao: 2, pontoExtra: 0.8 },
      ],
    });
    await prisma.presenca.createMany({
      data: [
        {
          eventoId: evento.id,
          diaId: dias[0].id,
          participanteId: mateus.id,
          presente: true,
        },
        {
          eventoId: evento.id,
          diaId: dias[2].id,
          participanteId: mateus.id,
          presente: true,
        },
        {
          eventoId: evento.id,
          diaId: dias[1].id,
          participanteId: zelia.id,
          presente: true,
        },
      ],
    });

    const classificacao = await app
      .get(RelatorioParcialService)
      .calcularClassificacaoParcial(evento.id);
    expect(classificacao.resumo).toMatchObject({
      desafiosLancados: 1,
      desafiosTotais: 2,
      empatesPendentes: [],
    });
    expect(
      await prisma.resultadoDesafio.count({ where: { eventoId: evento.id } }),
    ).toBe(2);
    expect(await prisma.desafio.count({ where: { eventoId: evento.id } })).toBe(
      2,
    );

    const previa = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${evento.id}/relatorios/final/previa`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(Array.isArray(previa.body)).toBe(true);
    expect(previa.body).toEqual([
      {
        turma: 'A-26',
        totalParticipantes: 1,
        participantes: [
          {
            turma: 'A-26',
            matricula: 'T229-A',
            nome: 'Mateus Azevedo',
            grupo: 'Alfa',
            presencas: [
              { numeroDia: 1, presente: true },
              { numeroDia: 2, presente: false },
              { numeroDia: 3, presente: true },
              { numeroDia: 4, presente: false },
              { numeroDia: 5, presente: false },
            ],
            pontoExtra: 0.4,
          },
        ],
      },
      {
        turma: 'TURMA-2026',
        totalParticipantes: 2,
        participantes: [
          {
            turma: 'TURMA-2026',
            matricula: 'T229-D',
            nome: 'Ágata do Ó',
            grupo: 'Beta',
            presencas: Array.from({ length: 5 }, (_, indice) => ({
              numeroDia: indice + 1,
              presente: false,
            })),
            pontoExtra: 0,
          },
          {
            turma: 'TURMA-2026',
            matricula: matriculaLonga,
            nome: nomeZelia,
            grupo: 'Beta',
            presencas: [
              { numeroDia: 1, presente: false },
              { numeroDia: 2, presente: true },
              { numeroDia: 3, presente: false },
              { numeroDia: 4, presente: false },
              { numeroDia: 5, presente: false },
            ],
            pontoExtra: 0.16,
          },
        ],
      },
    ]);

    const buscaAcentuada = await request(app.getHttpServer())
      .get(
        `/api/v1/eventos/${evento.id}/relatorios/final/previa?busca=${encodeURIComponent('Ágata')}`,
      )
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(matriculasRetornadas(buscaAcentuada.body)).toEqual(['T229-D']);

    const arquivos: Record<string, Buffer> = {};
    for (const formato of ['PDF', 'XLSX'] as const) {
      const resposta = await request(app.getHttpServer())
        .get(`/api/v1/eventos/${evento.id}/relatorios/final?formato=${formato}`)
        .auth(token, { type: 'bearer' })
        .buffer(true)
        .parse(binaryParser)
        .expect(200);
      const buffer = Buffer.from(resposta.body);
      arquivos[formato] = buffer;
      expect(buffer.length).toBeGreaterThan(0);
      expect(resposta.headers['content-disposition']).toContain(
        'relatorio-final-arena-rf17-final',
      );
      expect(resposta.headers['content-type']).toMatch(
        formato === 'PDF'
          ? /^application\/pdf/
          : /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      );
      expect(
        formato === 'PDF'
          ? buffer.subarray(0, 5).toString('ascii')
          : buffer.subarray(0, 2).toString('ascii'),
      ).toBe(formato === 'PDF' ? '%PDF-' : 'PK');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arquivos.XLSX as unknown as ExcelJS.Buffer);
    const worksheet = workbook.worksheets[0];
    const valoresDaLinha = (numero: number) =>
      Array.from(
        { length: 10 },
        (_, indice) => worksheet.getRow(numero).getCell(indice + 1).value,
      );
    expect(valoresDaLinha(5)).toEqual([
      'Turma',
      'Matrícula',
      'Nome',
      'Grupo',
      'Dia 1',
      'Dia 2',
      'Dia 3',
      'Dia 4',
      'Dia 5',
      'Ponto extra',
    ]);
    expect(valoresDaLinha(6)).toEqual([
      'A-26',
      'T229-A',
      'Mateus Azevedo',
      'Alfa',
      'Presente',
      'Ausente',
      'Presente',
      'Ausente',
      'Ausente',
      0.4,
    ]);
    expect(valoresDaLinha(7)).toEqual([
      'TURMA-2026',
      'T229-D',
      'Ágata do Ó',
      'Beta',
      'Ausente',
      'Ausente',
      'Ausente',
      'Ausente',
      'Ausente',
      0,
    ]);
    expect(valoresDaLinha(8)).toEqual([
      'TURMA-2026',
      matriculaLonga,
      nomeZelia,
      'Beta',
      'Ausente',
      'Presente',
      'Ausente',
      'Ausente',
      'Ausente',
      0.16,
    ]);
    expect(semResultado.id).not.toBe(lancado.id);
  });

  it('bloqueia empate pendente e libera as três rotas após desempate vigente', async () => {
    const eventoEmpate = await prisma.evento.create({
      data: {
        nome: nomeEventoEmpate,
        ano: 2095,
        dataInicio: new Date('2095-11-20T00:00:00.000Z'),
        dataFim: new Date('2095-11-21T00:00:00.000Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    createdEventIds.add(eventoEmpate.id);
    eventosPreservadosAteDescarte.add(eventoEmpate.id);
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
          matricula: matriculaEmpateAlfa,
          turma: 'A',
        },
      }),
      prisma.participante.create({
        data: {
          eventoId: eventoEmpate.id,
          grupoId: grupoBeta.id,
          nome: 'Beta Aluno',
          matricula: matriculaEmpateBeta,
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
