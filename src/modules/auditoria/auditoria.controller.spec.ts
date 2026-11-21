import { type INestApplication, ValidationPipe } from '@nestjs/common';
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
import { AuditoriaModule } from './auditoria.module.js';
import { AuditoriaService } from './auditoria.service.js';

const item = {
  dataHora: '2026-11-23T14:38:00Z',
  usuario: 'Administrador Arena',
  operacao: 'INSERT',
  valorAnterior: null,
  valorNovo: 'colocacao=2',
};

describe('AuditoriaController (HTTP com dependências simuladas)', () => {
  let app: INestApplication<App>;
  let token: string;
  const audit = { list: vi.fn() };
  const admin = {
    id: 7,
    nome: 'Administradora',
    email: 'admin@example.com',
    senhaHash: 'hash-simulado',
    perfil: 'ADMIN',
    ativo: true,
  };
  const users = { findByEmail: vi.fn(), findById: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 't255-test-only-secret-at-least-32-characters',
            }),
          ],
        }),
        AuthModule.register({ provide: AuthUserRepository, useValue: users }),
        PrismaModule,
        AuditoriaModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuditoriaService)
      .useValue(audit)
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
    audit.list.mockResolvedValue([item]);
  });

  it('devolve o histórico e converte o registroId em número', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auditoria?entidade=RESULTADO_DESAFIO&registroId=15')
      .auth(token, { type: 'bearer' })
      .expect(200, [item]);
    expect(audit.list).toHaveBeenCalledExactlyOnceWith('RESULTADO_DESAFIO', 15);
  });

  it('devolve array vazio quando não há histórico', async () => {
    audit.list.mockResolvedValueOnce([]);
    await request(app.getHttpServer())
      .get('/api/v1/auditoria?entidade=PENALIDADE&registroId=3')
      .auth(token, { type: 'bearer' })
      .expect(200, []);
  });

  it('exige autenticação', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auditoria?entidade=RESULTADO_DESAFIO&registroId=15')
      .expect(401);
    expect(audit.list).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'entidade=RESULTADO_DESAFIO',
    'registroId=15',
    'entidade=GRUPO&registroId=15',
    'entidade=resultado_desafio&registroId=15',
    'entidade=RESULTADO_DESAFIO&registroId=0',
    'entidade=RESULTADO_DESAFIO&registroId=1.5',
    'entidade=RESULTADO_DESAFIO&registroId=abc',
    'entidade=RESULTADO_DESAFIO&registroId=2147483648',
    'entidade=RESULTADO_DESAFIO&registroId=15&eventoId=1',
  ])('rejeita consulta inválida sem chamar o service: "%s"', async (query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/auditoria?${query}`)
      .auth(token, { type: 'bearer' })
      .expect(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
    expect(audit.list).not.toHaveBeenCalled();
  });
});
