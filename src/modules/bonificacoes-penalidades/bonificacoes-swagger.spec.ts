import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { configurarSwagger } from '../../config/swagger.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { BonificacoesPenalidadesModule } from './bonificacoes-penalidades.module.js';

describe('Swagger de bonificações', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuditoriaModule, BonificacoesPenalidadesModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    configurarSwagger(app);
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    document = response.body as OpenAPIObject;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('devolve o id de cada item, usado como registroId no histórico (RF18)', () => {
    expect(document.components?.schemas).toMatchObject({
      BonificacaoItemResumoDto: {
        type: 'object',
        required: ['id', 'itemBonificacaoId', 'valor'],
        properties: { id: { type: 'integer' } },
      },
      BonificacaoGrupoResumoDto: {
        properties: {
          itens: {
            type: 'array',
            items: { $ref: '#/components/schemas/BonificacaoItemResumoDto' },
          },
        },
      },
    });
  });

  it('mantém o corpo do PUT sem id', () => {
    const put =
      document.paths['/api/v1/eventos/{eventoId}/bonificacoes/{grupoId}']?.put;
    expect(put?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'array',
            items: { $ref: '#/components/schemas/BonificacaoEntradaDto' },
          },
        },
      },
    });
    const entrada = document.components?.schemas?.BonificacaoEntradaDto as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(entrada.properties)).toEqual([
      'itemBonificacaoId',
      'valor',
    ]);
  });
});
