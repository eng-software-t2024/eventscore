import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import {
  type INestApplication,
  NotFoundException,
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
import { FormatoRelatorio } from './enums/formato-relatorio.enum.js';
import { RelatorioParcialService } from './parcial/relatorio-parcial.service.js';
import { RelatoriosModule } from './relatorios.module.js';

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

describe('RelatoriosController (HTTP com dependências simuladas)', () => {
  let app: INestApplication<App>;
  let token: string;

  const relatorioParcialService = {
    gerarRelatorioParcial: vi.fn(),
  };

  const admin = {
    id: 1,
    nome: 'Admin Arena',
    email: 'admin@arena.com',
    senhaHash: 'hash',
    perfil: 'ADMIN',
    ativo: true,
  };

  const users = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: 't228-test-only-secret-at-least-32-characters',
            }),
          ],
        }),
        AuthModule.register({ provide: AuthUserRepository, useValue: users }),
        PrismaModule,
        AuditoriaModule,
        RelatoriosModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RelatorioParcialService)
      .useValue(relatorioParcialService)
      .compile();

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

    token = await app.get(JwtService).signAsync({ sub: admin.id });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue(admin);
  });

  it('retorna 401 quando o token JWT está ausente ou inválido', async () => {
    for (const authorization of [undefined, 'Bearer token-invalido']) {
      const req = request(app.getHttpServer()).get(
        '/api/v1/eventos/1/relatorios/parcial?formato=PDF',
      );
      if (authorization) {
        req.set('Authorization', authorization);
      }
      const res = await req.expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        message: 'Token ausente ou inválido',
        error: 'Unauthorized',
      });
    }
    expect(
      relatorioParcialService.gerarRelatorioParcial,
    ).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/eventos/1/relatorios/parcial',
    '/api/v1/eventos/1/relatorios/parcial?formato=CSV',
    '/api/v1/eventos/1/relatorios/parcial?formato=pdf',
    '/api/v1/eventos/0/relatorios/parcial?formato=PDF',
    '/api/v1/eventos/abc/relatorios/parcial?formato=PDF',
  ])(
    'retorna 400 Bad Request para parâmetros inválidos: %s',
    async (urlInvalida) => {
      const res = await request(app.getHttpServer())
        .get(urlInvalida)
        .auth(token, { type: 'bearer' })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(
        relatorioParcialService.gerarRelatorioParcial,
      ).not.toHaveBeenCalled();
    },
  );

  it('retorna 404 Not Found quando o evento não existe', async () => {
    relatorioParcialService.gerarRelatorioParcial.mockRejectedValueOnce(
      new NotFoundException('Evento não encontrado'),
    );

    await request(app.getHttpServer())
      .get('/api/v1/eventos/404/relatorios/parcial?formato=PDF')
      .auth(token, { type: 'bearer' })
      .expect(404, {
        statusCode: 404,
        message: 'Evento não encontrado',
        error: 'Not Found',
      });
  });

  it('retorna 200 OK com Content-Type e Content-Disposition corretos para PDF e XLSX', async () => {
    const bufferPdf = Buffer.from('%PDF-1.4 conteudo simulado');
    relatorioParcialService.gerarRelatorioParcial.mockResolvedValueOnce({
      buffer: bufferPdf,
      contentType: 'application/pdf',
      nomeArquivo: 'relatorio-parcial-arena-comp-2026.pdf',
      contentDisposition:
        'attachment; filename="relatorio-parcial-arena-comp-2026.pdf"; filename*=UTF-8\'\'relatorio-parcial-arena-comp-2026.pdf',
    });

    const resPdf = await request(app.getHttpServer())
      .get('/api/v1/eventos/1/relatorios/parcial?formato=PDF')
      .auth(token, { type: 'bearer' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(
      relatorioParcialService.gerarRelatorioParcial,
    ).toHaveBeenCalledExactlyOnceWith(1, FormatoRelatorio.PDF);
    expect(resPdf.headers['content-type']).toContain('application/pdf');
    expect(resPdf.headers['content-disposition']).toContain(
      'attachment; filename="relatorio-parcial-arena-comp-2026.pdf"',
    );
    expect(Buffer.from(resPdf.body).toString('utf8')).toBe(
      '%PDF-1.4 conteudo simulado',
    );

    const bufferXlsx = Buffer.from('PK\x03\x04 xlsx simulado');
    relatorioParcialService.gerarRelatorioParcial.mockResolvedValueOnce({
      buffer: bufferXlsx,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      nomeArquivo: 'relatorio-parcial-arena-comp-2026.xlsx',
      contentDisposition:
        'attachment; filename="relatorio-parcial-arena-comp-2026.xlsx"; filename*=UTF-8\'\'relatorio-parcial-arena-comp-2026.xlsx',
    });

    const resXlsx = await request(app.getHttpServer())
      .get('/api/v1/eventos/1/relatorios/parcial?formato=XLSX')
      .auth(token, { type: 'bearer' })
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(
      relatorioParcialService.gerarRelatorioParcial,
    ).toHaveBeenLastCalledWith(1, FormatoRelatorio.XLSX);
    expect(resXlsx.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(resXlsx.headers['content-disposition']).toContain(
      'attachment; filename="relatorio-parcial-arena-comp-2026.xlsx"',
    );
    expect(Buffer.from(resXlsx.body)).toEqual(bufferXlsx);
  });
});
