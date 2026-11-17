import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import type { DesafioDto } from '../src/modules/desafios/dto/desafio.dto.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Desafios HTTP e PostgreSQL (T248)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminId: number | undefined;
  let token: string;
  const eventoIds: number[] = [];
  const email = `t248-${randomUUID()}@example.test`;
  const senha = 'senha-exclusiva-integracao-t248';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
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
        nome: 'Administrador T248',
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
    token = (login.body as { token: string }).token;
  });

  afterAll(async () => {
    try {
      if (prisma && eventoIds.length > 0) {
        const whereEvento = { eventoId: { in: eventoIds } };
        await prisma.$transaction([
          prisma.resultadoDesafio.deleteMany({ where: whereEvento }),
          prisma.criterioDesempate.deleteMany({ where: whereEvento }),
          prisma.pontosColocacao.deleteMany({
            where: { desafio: { eventoId: { in: eventoIds } } },
          }),
          prisma.desafio.deleteMany({ where: whereEvento }),
          prisma.grupo.deleteMany({ where: whereEvento }),
          prisma.diaEvento.deleteMany({ where: whereEvento }),
          prisma.evento.deleteMany({ where: { id: { in: eventoIds } } }),
        ]);
      }
      if (adminId !== undefined) {
        await prisma.usuario.deleteMany({ where: { id: adminId } });
      }
    } finally {
      await app?.close();
    }
  });

  async function criarCenarioBase(totalGrupos = 2) {
    const evento = await prisma.evento.create({
      data: {
        nome: `Evento T248 ${randomUUID()}`,
        ano: 2097,
        dataInicio: new Date('2097-06-10T00:00:00Z'),
        dataFim: new Date('2097-06-12T00:00:00Z'),
        quantidadeDias: 2,
        ativo: false,
      },
    });
    eventoIds.push(evento.id);

    const dia1 = await prisma.diaEvento.create({
      data: {
        eventoId: evento.id,
        numeroDia: 1,
        data: new Date('2097-06-10T00:00:00Z'),
      },
    });
    const dia2 = await prisma.diaEvento.create({
      data: {
        eventoId: evento.id,
        numeroDia: 2,
        data: new Date('2097-06-11T00:00:00Z'),
      },
    });

    const grupos = [];
    for (let i = 1; i <= totalGrupos; i++) {
      const hex = String(i).padStart(2, '0');
      grupos.push(
        await prisma.grupo.create({
          data: {
            eventoId: evento.id,
            nome: `Grupo ${i} ${randomUUID().slice(0, 6)}`,
            cor: `#1122${hex}`,
          },
        }),
      );
    }

    return { evento, dia1, dia2, grupos };
  }

  function chamada(
    method: 'get' | 'post' | 'patch' | 'delete',
    eventoId: number,
    path = '',
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/eventos/${eventoId}/desafios${path}`)
      .auth(token, { type: 'bearer' });
  }

  it('recusa requisições sem token com 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios')
      .expect(401);
  });

  it('cria, normaliza, lista por numeroDia/id e consulta detalhe isolado por evento', async () => {
    const { evento, dia1, dia2 } = await criarCenarioBase(2);
    const outro = await criarCenarioBase(1);

    await chamada('get', evento.id).expect(200, []);

    const criadoDia2 = await chamada('post', evento.id)
      .send({
        nome: '  Hackathon  ',
        diaId: dia2.id,
        pontosColocacao: [
          { colocacao: 2, pontos: 80 },
          { colocacao: 1, pontos: 100 },
        ],
      })
      .expect(201);

    const desafio2 = criadoDia2.body as DesafioDto;
    expect(desafio2).toEqual({
      id: desafio2.id,
      nome: 'Hackathon',
      descricao: '',
      diaId: dia2.id,
      pontosColocacao: [
        { colocacao: 1, pontos: 100 },
        { colocacao: 2, pontos: 80 },
      ],
    });

    const criadoDia1 = await chamada('post', evento.id)
      .send({
        nome: 'Quiz',
        descricao: 'Perguntas técnicas',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 60 },
          { colocacao: 2, pontos: 40 },
        ],
      })
      .expect(201);

    const desafio1 = criadoDia1.body as DesafioDto;

    await chamada('get', evento.id).expect(200, [desafio1, desafio2]);
    await chamada('get', evento.id, `/${desafio2.id}`).expect(200, desafio2);

    // Isolamento: dia ou desafio de outro evento retorna 404
    await chamada('get', outro.evento.id, `/${desafio2.id}`).expect(404);
    await chamada('post', outro.evento.id)
      .send({
        nome: 'Invasor',
        diaId: dia1.id,
        pontosColocacao: [{ colocacao: 1, pontos: 50 }],
      })
      .expect(404);
  });

  it('valida regras 400, 409 (nome duplicado no mesmo dia) e 422 (grupos e tabela)', async () => {
    const semGrupos = await criarCenarioBase(0);
    await chamada('post', semGrupos.evento.id)
      .send({
        nome: 'Sem grupos',
        diaId: semGrupos.dia1.id,
        pontosColocacao: [{ colocacao: 1, pontos: 100 }],
      })
      .expect(422);

    const { evento, dia1 } = await criarCenarioBase(2);

    await chamada('post', evento.id)
      .send({
        nome: '   ',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      })
      .expect(400);

    await chamada('post', evento.id)
      .send({
        nome: 'Tabela incompleta',
        diaId: dia1.id,
        pontosColocacao: [{ colocacao: 1, pontos: 100 }],
      })
      .expect(422);

    await chamada('post', evento.id)
      .send({
        nome: 'Tabela com lacuna',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 3, pontos: 80 },
        ],
      })
      .expect(422);

    await chamada('post', evento.id)
      .send({
        nome: 'Maratona',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      })
      .expect(201);

    await chamada('post', evento.id)
      .send({
        nome: 'Maratona',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      })
      .expect(409);
  });

  it('aplica PATCH parcial, reenvio após resultados e bloqueia mudança efetiva com 409', async () => {
    const { evento, dia1, dia2, grupos } = await criarCenarioBase(2);

    const { body } = await chamada('post', evento.id)
      .send({
        nome: 'Hackathon',
        descricao: 'Original',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 80 },
        ],
      })
      .expect(201);
    const criado = body as DesafioDto;

    // PATCH parcial antes de resultados: substitui tabela quando muda e limpa descrição
    await chamada('patch', evento.id, `/${criado.id}`)
      .send({
        descricao: '',
        pontosColocacao: [
          { colocacao: 2, pontos: 70 },
          { colocacao: 1, pontos: 120 },
        ],
      })
      .expect(200, {
        id: criado.id,
        nome: 'Hackathon',
        descricao: '',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 120 },
          { colocacao: 2, pontos: 70 },
        ],
      });

    // Registra resultado para ativar bloqueio estrutural
    await prisma.resultadoDesafio.create({
      data: {
        eventoId: evento.id,
        desafioId: criado.id,
        grupoId: grupos[0].id,
        colocacao: 1,
      },
    });

    // Reenviar o mesmo diaId e mesma tabela (mesmo invertida) é aceito junto de nome/descrição
    await chamada('patch', evento.id, `/${criado.id}`)
      .send({
        nome: 'Hackathon final',
        descricao: 'Nova descrição',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 2, pontos: 70 },
          { colocacao: 1, pontos: 120 },
        ],
      })
      .expect(200, {
        id: criado.id,
        nome: 'Hackathon final',
        descricao: 'Nova descrição',
        diaId: dia1.id,
        pontosColocacao: [
          { colocacao: 1, pontos: 120 },
          { colocacao: 2, pontos: 70 },
        ],
      });

    // Mudança efetiva de diaId ou pontos retorna 409
    await chamada('patch', evento.id, `/${criado.id}`)
      .send({ diaId: dia2.id })
      .expect(409);

    await chamada('patch', evento.id, `/${criado.id}`)
      .send({
        pontosColocacao: [
          { colocacao: 1, pontos: 121 },
          { colocacao: 2, pontos: 70 },
        ],
      })
      .expect(409);

    // null explícito continua retornando 400
    await chamada('patch', evento.id, `/${criado.id}`)
      .send({ nome: null })
      .expect(400);
  });

  it('exclui desafio sem vínculos e recusa exclusão com critério ou resultado com 409', async () => {
    const { evento, dia1, grupos } = await criarCenarioBase(2);

    const livre = (
      await chamada('post', evento.id)
        .send({
          nome: 'Livre',
          diaId: dia1.id,
          pontosColocacao: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        })
        .expect(201)
    ).body as DesafioDto;

    await chamada('delete', evento.id, `/${livre.id}`).expect(204);
    await chamada('get', evento.id, `/${livre.id}`).expect(404);

    const comCriterio = (
      await chamada('post', evento.id)
        .send({
          nome: 'Com Critério',
          diaId: dia1.id,
          pontosColocacao: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        })
        .expect(201)
    ).body as DesafioDto;

    await prisma.criterioDesempate.create({
      data: {
        eventoId: evento.id,
        ordem: 1,
        descricao: 'Maior pontuação no desafio',
        tipo: 'MAIOR_PONTUACAO_DESAFIO',
        desafioId: comCriterio.id,
      },
    });

    await chamada('delete', evento.id, `/${comCriterio.id}`).expect(409);

    const comResultado = (
      await chamada('post', evento.id)
        .send({
          nome: 'Com Resultado',
          diaId: dia1.id,
          pontosColocacao: [
            { colocacao: 1, pontos: 100 },
            { colocacao: 2, pontos: 80 },
          ],
        })
        .expect(201)
    ).body as DesafioDto;

    await prisma.resultadoDesafio.create({
      data: {
        eventoId: evento.id,
        desafioId: comResultado.id,
        grupoId: grupos[0].id,
        colocacao: 1,
      },
    });

    await chamada('delete', evento.id, `/${comResultado.id}`).expect(409);
  });
});
