import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { configurarSwagger } from '../../config/swagger.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DesafiosModule } from './desafios.module.js';

describe('Swagger de desafios', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, DesafiosModule],
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

  it('publica os DTOs de desafios no Swagger conforme o contrato T245', () => {
    expect(document.components?.schemas).toMatchObject({
      PontoColocacaoDto: {
        type: 'object',
        required: ['colocacao', 'pontos'],
        properties: {
          colocacao: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
          pontos: { type: 'integer', minimum: 0, maximum: 2_147_483_647 },
        },
      },
      CriarDesafioDto: {
        type: 'object',
        required: ['nome', 'diaId', 'pontosColocacao'],
        properties: {
          nome: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '\\S',
          },
          descricao: { type: 'string', maxLength: 255, default: '' },
          diaId: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
          pontosColocacao: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/components/schemas/PontoColocacaoDto' },
          },
        },
      },
      AtualizarDesafioDto: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            pattern: '\\S',
          },
          descricao: { type: 'string', maxLength: 255 },
          diaId: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
          pontosColocacao: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/components/schemas/PontoColocacaoDto' },
          },
        },
      },
      DesafioDto: {
        type: 'object',
        required: ['id', 'nome', 'descricao', 'diaId', 'pontosColocacao'],
        properties: {
          id: { type: 'integer', minimum: 1 },
          nome: { type: 'string' },
          descricao: { type: 'string' },
          diaId: { type: 'integer', minimum: 1 },
          pontosColocacao: {
            type: 'array',
            items: { $ref: '#/components/schemas/PontoColocacaoDto' },
          },
        },
      },
    });
    expect(
      document.components?.schemas?.AtualizarDesafioDto,
    ).not.toHaveProperty('required');
  });

  it.each([
    ['/api/v1/eventos/{eventoId}/desafios', 'get', 'listarDesafios', '200'],
    ['/api/v1/eventos/{eventoId}/desafios', 'post', 'criarDesafio', '201'],
    [
      '/api/v1/eventos/{eventoId}/desafios/{desafioId}',
      'get',
      'obterDesafioPorId',
      '200',
    ],
    [
      '/api/v1/eventos/{eventoId}/desafios/{desafioId}',
      'patch',
      'atualizarDesafio',
      '200',
    ],
    [
      '/api/v1/eventos/{eventoId}/desafios/{desafioId}',
      'delete',
      'excluirDesafio',
      '204',
    ],
  ] as const)(
    'documenta %s %s com status de sucesso e segurança Bearer',
    (path, method, operationId, status) => {
      const operation = document.paths[path]?.[method];
      expect(operation).toMatchObject({
        operationId,
        security: [{ bearer: [] }],
        responses: {
          [status]: expect.any(Object),
          '401': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErroPadraoDto' },
              },
            },
          },
        },
      });
    },
  );
});
