import {
  ConflictException,
  type INestApplication,
  NotFoundException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthUserRepository } from '../auth/auth-user.repository.js';
import { ConfiguracaoModule } from './configuracao.module.js';
import { ConfiguracaoService } from './configuracao.service.js';

const configuracao = {
  conversaoPontoExtra: [
    { colocacao: 1, pontoExtra: 1 },
    { colocacao: 2, pontoExtra: 0.8 },
  ],
  itensBonificacao: [{ id: 1, nome: 'Uniformização', teto: 10 }],
  penalidadeMin: 10,
  penalidadeMax: 50,
  fatoresPresenca: [
    { diasPresentes: 0, fator: 0 },
    { diasPresentes: 1, fator: 0.5 },
    { diasPresentes: 2, fator: 1 },
  ],
  criteriosDesempate: [
    {
      ordem: 1,
      tipo: 'MAIOR_BONIFICACAO',
      desafioId: null,
      descricao: 'Maior bonificação',
    },
  ],
};

describe('ConfiguracaoController (HTTP com dependências simuladas)', () => {
  let app: INestApplication<App>;
  let token: string;
  const servico = { obter: vi.fn(), salvar: vi.fn() };
  const admin = {
    id: 7,
    nome: 'Administradora',
    email: 'admin@example.com',
    senhaHash: 'hash-simulado',
    perfil: 'ADMIN',
    ativo: true,
  };
  const users = { findByEmail: vi.fn(), findById: vi.fn() };

  const url = (eventoId: number | string = 1) =>
    `/api/v1/eventos/${eventoId}/configuracao`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 't199-test-only-secret-at-least-32-characters',
            }),
          ],
        }),
        AuthModule.register({ provide: AuthUserRepository, useValue: users }),
        PrismaModule,
        ConfiguracaoModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ConfiguracaoService)
      .useValue(servico)
      .compile();

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
    token = await app.get(JwtService).signAsync({ sub: admin.id });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue(admin);
    servico.obter.mockResolvedValue(configuracao);
    servico.salvar.mockResolvedValue(configuracao);
  });

  it('exige autenticação JWT no GET e no PUT', async () => {
    await request(app.getHttpServer()).get(url()).expect(401);
    await request(app.getHttpServer())
      .put(url())
      .send(configuracao)
      .expect(401);

    expect(servico.obter).not.toHaveBeenCalled();
    expect(servico.salvar).not.toHaveBeenCalled();
  });

  it('consulta a configuração com 200', async () => {
    await request(app.getHttpServer())
      .get(url(3))
      .auth(token, { type: 'bearer' })
      .expect(200, configuracao);

    expect(servico.obter).toHaveBeenCalledWith(3);
  });

  it('salva com 200 e repassa o corpo validado ao service', async () => {
    await request(app.getHttpServer())
      .put(url(3))
      .auth(token, { type: 'bearer' })
      .send(configuracao)
      .expect(200, configuracao);

    expect(servico.salvar).toHaveBeenCalledWith(3, configuracao);
  });

  it.each(['0', 'abc', '2147483648'])(
    'recusa eventoId %s com 400',
    async (eventoId) => {
      await request(app.getHttpServer())
        .get(url(eventoId))
        .auth(token, { type: 'bearer' })
        .expect(400);

      expect(servico.obter).not.toHaveBeenCalled();
    },
  );

  it('recusa corpo inválido com 400 sem chamar o service', async () => {
    const resposta = await request(app.getHttpServer())
      .put(url())
      .auth(token, { type: 'bearer' })
      .send({ ...configuracao, penalidadeMin: '10' })
      .expect(400);

    expect(resposta.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
    expect(servico.salvar).not.toHaveBeenCalled();
  });

  it.each([
    [new NotFoundException('Evento não encontrado'), 404],
    [new ConflictException('Item já lançado'), 409],
    [new UnprocessableEntityException('Faixa inválida'), 422],
  ])('propaga %s como %i', async (erro, status) => {
    servico.salvar.mockRejectedValue(erro);

    const resposta = await request(app.getHttpServer())
      .put(url())
      .auth(token, { type: 'bearer' })
      .send(configuracao)
      .expect(status);

    expect(resposta.body).toMatchObject({
      statusCode: status,
      message: erro.message,
    });
  });
});
