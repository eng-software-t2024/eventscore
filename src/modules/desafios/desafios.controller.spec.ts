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
import { DesafiosModule } from './desafios.module.js';
import { DesafiosService } from './desafios.service.js';

const entrada = {
  nome: 'Hackathon',
  descricao: 'Desenvolvimento em equipe',
  diaId: 2,
  pontosColocacao: [
    { colocacao: 1, pontos: 100 },
    { colocacao: 2, pontos: 80 },
  ],
};

const desafio = { id: 3, ...entrada };

const rotas = [
  ['get', '/eventos/1/desafios'],
  ['post', '/eventos/1/desafios'],
  ['get', '/eventos/1/desafios/3'],
  ['patch', '/eventos/1/desafios/3'],
  ['delete', '/eventos/1/desafios/3'],
] as const;

describe('DesafiosController (HTTP com dependências simuladas)', () => {
  let app: INestApplication<App>;
  let token: string;
  const desafios = {
    list: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
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
              JWT_SECRET: 't247-test-only-secret-at-least-32-characters',
            }),
          ],
        }),
        AuthModule.register({ provide: AuthUserRepository, useValue: users }),
        PrismaModule,
        DesafiosModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(DesafiosService)
      .useValue(desafios)
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
    desafios.list.mockResolvedValue([desafio]);
    desafios.create.mockResolvedValue(desafio);
    desafios.findById.mockResolvedValue(desafio);
    desafios.update.mockResolvedValue({ ...desafio, nome: 'Hackathon final' });
    desafios.remove.mockResolvedValue(undefined);
  });

  it.each(rotas)(
    'rejeita %s %s sem token com 401 do guard global',
    async (method, path) => {
      await request(app.getHttpServer())[method](`/api/v1${path}`).expect(401);
    },
  );

  it('rejeita token inválido ou administrador inativo com 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios')
      .auth('token-invalido', { type: 'bearer' })
      .expect(401);

    users.findById.mockResolvedValueOnce({ ...admin, ativo: false });
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });

  it('lista desafios do evento como array', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios')
      .auth(token, { type: 'bearer' })
      .expect(200, [desafio]);

    expect(desafios.list).toHaveBeenCalledWith(1);
  });

  it('cria desafio com 201 aplicando trim em nome', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/eventos/1/desafios')
      .auth(token, { type: 'bearer' })
      .send({ ...entrada, nome: '  Hackathon  ' })
      .expect(201, desafio);

    expect(desafios.create).toHaveBeenCalledWith(1, entrada);
  });

  it('consulta detalhe e atualiza parcialmente com 200', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/3')
      .auth(token, { type: 'bearer' })
      .expect(200, desafio);

    await request(app.getHttpServer())
      .patch('/api/v1/eventos/1/desafios/3')
      .auth(token, { type: 'bearer' })
      .send({ nome: '  Hackathon final  ' })
      .expect(200, { ...desafio, nome: 'Hackathon final' });

    expect(desafios.findById).toHaveBeenCalledWith(1, 3);
    expect(desafios.update).toHaveBeenCalledWith(1, 3, {
      nome: 'Hackathon final',
    });
  });

  it('exclui desafio com 204 e sem corpo', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/v1/eventos/1/desafios/3')
      .auth(token, { type: 'bearer' })
      .expect(204);

    expect(response.text).toBe('');
    expect(desafios.remove).toHaveBeenCalledWith(1, 3);
  });

  it('rejeita parâmetros inválidos e campos desconhecidos com 400 antes do service', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/eventos/0/desafios')
      .auth(token, { type: 'bearer' })
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/abc')
      .auth(token, { type: 'bearer' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/eventos/1/desafios')
      .auth(token, { type: 'bearer' })
      .send({ ...entrada, peso: 2 })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/v1/eventos/1/desafios/3')
      .auth(token, { type: 'bearer' })
      .send({ nome: '   ' })
      .expect(400);

    expect(desafios.list).not.toHaveBeenCalled();
    expect(desafios.findById).not.toHaveBeenCalled();
    expect(desafios.create).not.toHaveBeenCalled();
    expect(desafios.update).not.toHaveBeenCalled();
  });

  it('propaga 404, 409 e 422 do service no envelope padrão do NestJS', async () => {
    desafios.findById.mockRejectedValueOnce(
      new NotFoundException('Desafio não encontrado neste evento'),
    );
    await request(app.getHttpServer())
      .get('/api/v1/eventos/1/desafios/99')
      .auth(token, { type: 'bearer' })
      .expect(404, {
        statusCode: 404,
        message: 'Desafio não encontrado neste evento',
        error: 'Not Found',
      });

    desafios.remove.mockRejectedValueOnce(
      new ConflictException(
        'O desafio está vinculado a um critério de desempate.',
      ),
    );
    await request(app.getHttpServer())
      .delete('/api/v1/eventos/1/desafios/3')
      .auth(token, { type: 'bearer' })
      .expect(409, {
        statusCode: 409,
        message: 'O desafio está vinculado a um critério de desempate.',
        error: 'Conflict',
      });

    desafios.create.mockRejectedValueOnce(
      new UnprocessableEntityException(
        'A tabela de pontos precisa ter uma linha por grupo (2).',
      ),
    );
    await request(app.getHttpServer())
      .post('/api/v1/eventos/1/desafios')
      .auth(token, { type: 'bearer' })
      .send(entrada)
      .expect(422, {
        statusCode: 422,
        message: 'A tabela de pontos precisa ter uma linha por grupo (2).',
        error: 'Unprocessable Entity',
      });
  });
});
