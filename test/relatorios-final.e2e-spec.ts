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
    const desafioZeroEAusencia = await prisma.desafio.create({
      data: {
        eventoId,
        diaId: dia2.id,
        nome: 'Desafio com pontuação zero e ausência',
        pontosColocacao: {
          create: [
            { colocacao: 1, pontos: 0 },
            { colocacao: 2, pontos: 0 },
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
        {
          eventoId,
          desafioId: desafioZeroEAusencia.id,
          grupoId: alfa.id,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId,
          desafioId: desafioZeroEAusencia.id,
          grupoId: beta.id,
          colocacao: null,
          ausente: true,
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

  it('renderiza matrículas de 17 e 20 caracteres em PDF multipágina com campos textuais longos', async () => {
    const evento = await prisma.evento.create({
      data: {
        nome: `Relatório final com texto longo ${fixtureRunId}`,
        ano: 2097,
        dataInicio: new Date('2097-11-20T00:00:00.000Z'),
        dataFim: new Date('2097-11-24T00:00:00.000Z'),
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
            data: new Date(Date.UTC(2097, 10, 20 + indice)),
          },
        }),
      ),
    );
    const nomeGrupoAlfa = `Grupo São José ${'á'.repeat(45)}`;
    const nomeGrupoBeta = `Grupo João da Conceição ${'é'.repeat(36)}`;
    expect(nomeGrupoAlfa).toHaveLength(60);
    expect(nomeGrupoBeta).toHaveLength(60);
    const [alfa, beta] = await Promise.all([
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: nomeGrupoAlfa, cor: '#112233' },
      }),
      prisma.grupo.create({
        data: { eventoId: evento.id, nome: nomeGrupoBeta, cor: '#445566' },
      }),
    ]);

    const matricula17 = `A${'1'.repeat(16)}`;
    const matricula20 = `M${'2'.repeat(19)}`;
    const nome150 = 'Zélia de Ávila '.repeat(10);
    const nomeLongo = 'João da Conceição '.repeat(8);
    expect(matricula17).toHaveLength(17);
    expect(matricula20).toHaveLength(20);
    expect(nome150).toHaveLength(150);
    expect(nomeLongo.length).toBeLessThanOrEqual(150);
    const participantes = Array.from({ length: 40 }, (_, indice) => {
      const grupoIndex = indice < 20 ? 0 : 1;
      const grupoId = grupoIndex === 0 ? alfa.id : beta.id;
      return {
        eventoId: evento.id,
        grupoId,
        nome:
          indice === 0
            ? nome150
            : indice === 1
              ? nomeLongo
              : `Participante da amostra ${String(indice).padStart(2, '0')}`,
        matricula:
          indice === 0
            ? matricula17
            : indice === 1
              ? matricula20
              : `LONG${fixtureRunId.slice(0, 8)}${String(indice).padStart(2, '0')}`,
        turma:
          indice === 0
            ? 'TURMA-2026'
            : indice === 1
              ? '7º ANO-26'
              : grupoIndex === 0
                ? 'A'
                : 'B',
      };
    });
    await prisma.participante.createMany({ data: participantes });
    const participantesComMatriculaLonga = await prisma.participante.findMany({
      where: {
        eventoId: evento.id,
        matricula: { in: [matricula17, matricula20] },
      },
      select: { id: true, matricula: true },
    });
    await prisma.presenca.createMany({
      data: participantesComMatriculaLonga.map((participante, indice) => ({
        eventoId: evento.id,
        diaId: dias[indice].id,
        participanteId: participante.id,
        presente: true,
      })),
    });

    const desafio = await prisma.desafio.create({
      data: {
        eventoId: evento.id,
        diaId: dias[0].id,
        nome: 'Desafio de layout',
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
          eventoId: evento.id,
          desafioId: desafio.id,
          grupoId: alfa.id,
          colocacao: 1,
          ausente: false,
        },
        {
          eventoId: evento.id,
          desafioId: desafio.id,
          grupoId: beta.id,
          colocacao: 2,
          ausente: false,
        },
      ],
    });
    await prisma.fatorPresenca.createMany({
      data: Array.from({ length: 6 }, (_, diasPresentes) => ({
        eventoId: evento.id,
        diasPresentes,
        fator: 0.5,
      })),
    });
    await prisma.conversaoPontoExtra.createMany({
      data: [
        { eventoId: evento.id, colocacao: 1, pontoExtra: 1 },
        { eventoId: evento.id, colocacao: 2, pontoExtra: 0.8 },
      ],
    });

    const resposta = await request(app.getHttpServer())
      .get(`/api/v1/eventos/${evento.id}/relatorios/final?formato=PDF`)
      .auth(token, { type: 'bearer' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(resposta.headers['content-type']).toMatch(/^application\/pdf/);
    expect(resposta.headers['content-disposition']).toContain('.pdf');
    const pdf = Buffer.from(resposta.body);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const paginas = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
    expect(paginas.length).toBeGreaterThanOrEqual(2);
  });

  it('distingue evento sem desafios de evento com desafio e sem grupos nas três saídas', async () => {
    for (const fixture of [
      { nome: 'sem-desafios', ano: 2092, comGrupo: true, comDesafio: false },
      { nome: 'sem-grupos', ano: 2093, comGrupo: false, comDesafio: true },
    ]) {
      const evento = await prisma.evento.create({
        data: {
          nome: `Disponibilidade ${fixture.nome} ${fixtureRunId}`,
          ano: fixture.ano,
          dataInicio: new Date(`${fixture.ano}-11-20T00:00:00.000Z`),
          dataFim: new Date(`${fixture.ano}-11-20T00:00:00.000Z`),
          quantidadeDias: 1,
          ativo: false,
        },
      });
      createdEventIds.add(evento.id);
      const dia = await prisma.diaEvento.create({
        data: {
          eventoId: evento.id,
          numeroDia: 1,
          data: new Date(`${fixture.ano}-11-20T00:00:00.000Z`),
        },
      });
      if (fixture.comGrupo) {
        await prisma.grupo.create({
          data: { eventoId: evento.id, nome: 'Grupo fixture', cor: '#112233' },
        });
      }
      if (fixture.comDesafio) {
        await prisma.desafio.create({
          data: { eventoId: evento.id, diaId: dia.id, nome: 'Desafio fixture' },
        });
      }
      const motivo = fixture.comGrupo
        ? 'não possui desafios'
        : 'não possui grupos';
      for (const rota of [
        `/api/v1/eventos/${evento.id}/relatorios/final/previa`,
        `/api/v1/eventos/${evento.id}/relatorios/final?formato=PDF`,
        `/api/v1/eventos/${evento.id}/relatorios/final?formato=XLSX`,
      ]) {
        const resposta = await request(app.getHttpServer())
          .get(rota)
          .auth(token, { type: 'bearer' })
          .expect(409);
        expect(resposta.body.message).toContain(motivo);
      }
    }
  });

  // Caracteriza o bloqueio: com um de dois desafios lançado, as três rotas finais respondem 409.
  it('bloqueia as três rotas com um de dois desafios lançado, sem empate', async () => {
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
    const [lancado] = await Promise.all([
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
    await request(app.getHttpServer())
      .get(`/api/v1/eventos/${evento.id}/relatorios/parcial?formato=PDF`)
      .auth(token, { type: 'bearer' })
      .expect(200);

    for (const rota of [
      `/api/v1/eventos/${evento.id}/relatorios/final/previa`,
      `/api/v1/eventos/${evento.id}/relatorios/final?formato=PDF`,
      `/api/v1/eventos/${evento.id}/relatorios/final?formato=XLSX`,
    ]) {
      const resposta = await request(app.getHttpServer())
        .get(rota)
        .auth(token, { type: 'bearer' })
        .expect(409);
      expect(resposta.body.message).toContain('resultados pendentes');
    }
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
