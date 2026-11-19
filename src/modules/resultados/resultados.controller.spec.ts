import {
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
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthUserRepository } from '../auth/auth-user.repository.js';
import { ResultadosModule } from './resultados.module.js';
import { ResultadosService } from './resultados.service.js';

const respostaResultados = [
  { id: 11, grupoId: 1, colocacao: 1, ausente: false, pontos: 100 },
  { id: 12, grupoId: 2, colocacao: 2, ausente: false, pontos: 80 },
];

describe('ResultadosController (HTTP com dependências simuladas)', () => {
  let app: INestApplication<App>;
  let token: string;
  const resultados = {
    list: vi.fn(),
    save: vi.fn(),
  };
  const admin = {
    id: 7,
    nome: 'Administradora',
    email: 'admin@example.com',
    senhaHash: 'hash-simulado',
    perfil: 'ADMIN',
    ativo: true,
  };
  const users = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 't223-test-only-secret-at-least-32-characters',
            }),
          ],
        }),
        AuthModule.register({ provide: AuthUserRepository, useValue: users }),
        PrismaModule,
        AuditoriaModule,
        ResultadosModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ResultadosService)
      .useValue(resultados)
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
    resultados.list.mockResolvedValue(respostaResultados);
    resultados.save.mockResolvedValue(respostaResultados);
  });

  it('exige autenticação JWT nas rotas GET e PUT', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/3/resultados')
      .expect(401);

    await request(app.getHttpServer())
      .put('/api/v1/eventos/1/desafios/3/resultados')
      .send([{ grupoId: 1, colocacao: 1, ausente: false }])
      .expect(401);
  });

  it('consulta colocações com 200', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .expect(200, respostaResultados);

    expect(resultados.list).toHaveBeenCalledWith(1, 3);
  });

  it('repassa userId do JWT, eventoId, desafioId e array validado ao service no PUT', async () => {
    const body = [
      { grupoId: 1, colocacao: 1, ausente: false },
      { grupoId: 2, colocacao: 2, ausente: false },
    ];

    await request(app.getHttpServer())
      .put('/api/v1/eventos/1/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(200, respostaResultados);

    expect(resultados.save).toHaveBeenCalledWith(admin.id, 1, 3, body);
  });

  it('rejeita parâmetros ou corpo inválido com 400 antes do service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/0/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/v1/eventos/1/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .send({ grupoId: 1, colocacao: 1, ausente: false })
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/v1/eventos/1/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .send([{ grupoId: 1, colocacao: 1, ausente: false, pontos: 100 }])
      .expect(400);

    await request(app.getHttpServer())
      .put('/api/v1/eventos/1/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .send([{ grupoId: 1, colocacao: '1', ausente: false }])
      .expect(400);

    expect(resultados.list).not.toHaveBeenCalled();
    expect(resultados.save).not.toHaveBeenCalled();
  });

  it('propaga 404 e 422 do service no envelope padrão do NestJS', async () => {
    resultados.list.mockRejectedValueOnce(
      new NotFoundException('Desafio não encontrado neste evento'),
    );
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/99/resultados')
      .auth(token, { type: 'bearer' })
      .expect(404, {
        statusCode: 404,
        message: 'Desafio não encontrado neste evento',
        error: 'Not Found',
      });

    resultados.save.mockRejectedValueOnce(
      new UnprocessableEntityException(
        'Dois grupos não podem ter a mesma colocação.',
      ),
    );
    await request(app.getHttpServer())
      .put('/api/v1/eventos/1/desafios/3/resultados')
      .auth(token, { type: 'bearer' })
      .send([
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: 1, ausente: false },
      ])
      .expect(422, {
        statusCode: 422,
        message: 'Dois grupos não podem ter a mesma colocação.',
        error: 'Unprocessable Entity',
      });
  });
});
