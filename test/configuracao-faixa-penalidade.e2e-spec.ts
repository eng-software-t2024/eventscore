import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { PasswordHashService } from '../src/modules/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Configuração sem faixa de penalidade', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventoId: number;
  let grupoId: number;
  let token: string;
  const identificador = randomUUID();
  const email = `faixa-penalidade-${identificador}@example.test`;
  const senha = 'senha-exclusiva-teste-faixa';

  const config = (
    penalidadeMin: number | null,
    penalidadeMax: number | null,
  ) => ({
    conversaoPontoExtra: [{ colocacao: 1, pontoExtra: 1 }],
    itensBonificacao: [],
    penalidadeMin,
    penalidadeMax,
    fatoresPresenca: [
      { diasPresentes: 0, fator: 0 },
      { diasPresentes: 1, fator: 1 },
    ],
    criteriosDesempate: [],
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.usuario.create({
      data: {
        nome: 'Administrador teste faixa de penalidade',
        email,
        senhaHash: await app.get(PasswordHashService).hash(senha),
        perfil: 'ADMIN',
        ativo: true,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, senha })
      .expect(200);
    token = login.body.token;

    const evento = await prisma.evento.create({
      data: {
        nome: `Teste de faixa nula ${identificador}`,
        ano: 2098,
        dataInicio: new Date('2098-05-10T00:00:00.000Z'),
        dataFim: new Date('2098-05-10T00:00:00.000Z'),
        quantidadeDias: 1,
      },
    });
    eventoId = evento.id;
    const grupo = await prisma.grupo.create({
      data: { eventoId, nome: `Grupo ${identificador}`, cor: '#2468AC' },
    });
    grupoId = grupo.id;
  });

  afterAll(async () => {
    // O lançamento grava auditoria append-only, que referencia usuário e evento.
    // Como nos E2E de penalidade, fixtures UUID ficam no banco exclusivo de testes,
    // descartado ao fim da execução.
    await app?.close();
  });

  it('salva outras regras com faixa nula, recusa a penalidade e preserva a faixa após lançamento', async () => {
    const base = `/api/v1/eventos/${eventoId}`;

    await request(app.getHttpServer())
      .get(`${base}/configuracao`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.penalidadeMin).toBeNull();
        expect(body.penalidadeMax).toBeNull();
      });

    await request(app.getHttpServer())
      .put(`${base}/configuracao`)
      .set('Authorization', `Bearer ${token}`)
      .send(config(null, null))
      .expect(200)
      .expect(({ body }) => {
        expect(body.penalidadeMin).toBeNull();
        expect(body.penalidadeMax).toBeNull();
        expect(body.conversaoPontoExtra).toEqual([
          { colocacao: 1, pontoExtra: 1 },
        ]);
        expect(body.fatoresPresenca).toEqual([
          { diasPresentes: 0, fator: 0 },
          { diasPresentes: 1, fator: 1 },
        ]);
      });

    await request(app.getHttpServer())
      .post(`${base}/penalidades`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        grupoId,
        pontos: 20,
        descricao: 'Atraso',
        justificativa: 'Teste local',
      })
      .expect(422)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'A faixa de penalidade ainda não foi configurada para o evento',
        );
      });
    await expect(
      prisma.penalidade.count({ where: { grupo: { eventoId } } }),
    ).resolves.toBe(0);

    await request(app.getHttpServer())
      .put(`${base}/configuracao`)
      .set('Authorization', `Bearer ${token}`)
      .send(config(10, 50))
      .expect(200);

    await request(app.getHttpServer())
      .post(`${base}/penalidades`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        grupoId,
        pontos: 20,
        descricao: 'Atraso',
        justificativa: 'Teste local',
      })
      .expect(201)
      .expect(({ body }) => expect(body.pontos).toBe(20));

    await request(app.getHttpServer())
      .put(`${base}/configuracao`)
      .set('Authorization', `Bearer ${token}`)
      .send(config(null, null))
      .expect(422)
      .expect(({ body }) => {
        expect(body.message).toBe(
          'Não é possível remover a faixa de penalidade porque já há penalidade lançada.',
        );
      });

    await request(app.getHttpServer())
      .get(`${base}/configuracao`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.penalidadeMin).toBe(10);
        expect(body.penalidadeMax).toBe(50);
      });
  });
});
