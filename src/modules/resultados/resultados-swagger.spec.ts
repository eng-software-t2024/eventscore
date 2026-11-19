import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { configurarSwagger } from '../../config/swagger.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { ResultadosModule } from './resultados.module.js';

describe('Swagger de resultados', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, AuditoriaModule, ResultadosModule],
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

  it('separa ResultadoDto (GET, id anulável) de ResultadoSalvoDto (PUT, id obrigatório)', () => {
    expect(document.components?.schemas).toMatchObject({
      SalvarResultadoDto: {
        type: 'object',
        required: ['grupoId', 'colocacao', 'ausente'],
        properties: {
          grupoId: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
          colocacao: {
            type: 'integer',
            nullable: true,
            minimum: 1,
            maximum: 2_147_483_647,
          },
          ausente: { type: 'boolean' },
        },
      },
      ResultadoDto: {
        type: 'object',
        required: ['id', 'grupoId', 'colocacao', 'ausente', 'pontos'],
        properties: {
          id: {
            type: 'integer',
            nullable: true,
            minimum: 1,
            maximum: 2_147_483_647,
          },
        },
      },
      ResultadoSalvoDto: {
        type: 'object',
        required: ['id', 'grupoId', 'colocacao', 'ausente', 'pontos'],
        properties: {
          id: {
            type: 'integer',
            minimum: 1,
            maximum: 2_147_483_647,
          },
        },
      },
    });
    expect(
      (
        document.components?.schemas?.ResultadoSalvoDto as {
          properties?: { id?: { nullable?: boolean } };
        }
      )?.properties?.id?.nullable,
    ).not.toBe(true);
  });

  it('documenta GET e PUT de resultados com Bearer e schemas distintos', () => {
    const path = '/api/v1/eventos/{eventoId}/desafios/{desafioId}/resultados';
    expect(document.paths[path]?.get).toMatchObject({
      operationId: 'listarResultadosDoDesafio',
      security: [{ bearer: [] }],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/ResultadoDto' },
              },
            },
          },
        },
      },
    });

    expect(document.paths[path]?.put).toMatchObject({
      operationId: 'salvarResultadosDoDesafio',
      security: [{ bearer: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: { $ref: '#/components/schemas/SalvarResultadoDto' },
            },
          },
        },
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/ResultadoSalvoDto' },
              },
            },
          },
        },
      },
    });
  });
});
