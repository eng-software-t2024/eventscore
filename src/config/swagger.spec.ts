import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { EventosModule } from '../modules/eventos/eventos.module.js';
import { RelatoriosModule } from '../modules/relatorios/relatorios.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { configurarSwagger } from './swagger.js';

describe('Swagger de eventos', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, EventosModule, RelatoriosModule],
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

  it('publica os quatro DTOs na documentação HTTP usada pela aplicação', () => {
    expect(document.components?.schemas).toMatchObject({
      CriarEventoDto: {
        required: ['nome', 'ano', 'dataInicio', 'dataFim', 'quantidadeDias'],
      },
      AtualizarEventoDto: { type: 'object' },
      EventoResumoDto: {
        required: [
          'id',
          'nome',
          'ano',
          'dataInicio',
          'dataFim',
          'ativo',
          'quantidadeDias',
        ],
      },
      EventoDetalheDto: {
        required: [
          'id',
          'nome',
          'ano',
          'dataInicio',
          'dataFim',
          'ativo',
          'quantidadeDias',
          'temResultado',
        ],
      },
    });
    expect(document.components?.schemas?.AtualizarEventoDto).not.toHaveProperty(
      'required',
    );
  });

  it.each(['CriarEventoDto', 'AtualizarEventoDto'])(
    'publica os campos inteiros e limites de %s conforme o contrato',
    (schema) => {
      expect(document.components?.schemas?.[schema]).toMatchObject({
        properties: {
          ano: { type: 'integer', minimum: 2000, maximum: 2100 },
          quantidadeDias: { type: 'integer', minimum: 1 },
        },
      });
    },
  );

  it.each(['EventoResumoDto', 'EventoDetalheDto'])(
    'publica os campos inteiros de %s conforme o contrato',
    (schema) => {
      expect(document.components?.schemas?.[schema]).toMatchObject({
        properties: {
          id: { type: 'integer' },
          ano: { type: 'integer' },
          quantidadeDias: { type: 'integer', minimum: 1 },
        },
      });
    },
  );

  it('publica os DTOs de erro padronizados (ErroPadraoDto e ErroValidacaoDto)', () => {
    expect(document.components?.schemas).toMatchObject({
      ErroPadraoDto: {
        type: 'object',
        required: ['statusCode', 'message', 'error'],
        properties: {
          statusCode: { type: 'integer' },
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      ErroValidacaoDto: {
        type: 'object',
        required: ['statusCode', 'message', 'error'],
        properties: {
          statusCode: { type: 'integer' },
          message: { type: 'array', items: { type: 'string' } },
          error: { type: 'string' },
        },
      },
    });
  });

  it('publica o esquema Bearer JWT para as rotas administrativas', () => {
    expect(document.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    expect(document.security).toBeUndefined();
  });

  it.each([
    ['/api/v1/eventos', 'get', 'listarEventos', '200'],
    ['/api/v1/eventos', 'post', 'criarEvento', '201'],
    ['/api/v1/eventos/ativo', 'get', 'obterEventoAtivo', '200'],
    ['/api/v1/eventos/{eventoId}', 'get', 'obterEventoPorId', '200'],
    ['/api/v1/eventos/{eventoId}', 'patch', 'atualizarEvento', '200'],
    ['/api/v1/eventos/{eventoId}/ativar', 'post', 'ativarEvento', '200'],
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

  it('publica corpos e respostas das rotas conforme os DTOs do contrato', () => {
    const resumo = { $ref: '#/components/schemas/EventoResumoDto' };
    expect(
      document.paths['/api/v1/eventos']?.get?.responses['200'],
    ).toMatchObject({
      content: {
        'application/json': { schema: { type: 'array', items: resumo } },
      },
    });
    expect(document.paths['/api/v1/eventos']?.post).toMatchObject({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CriarEventoDto' },
          },
        },
      },
      responses: {
        '201': { content: { 'application/json': { schema: resumo } } },
      },
    });
    expect(document.paths['/api/v1/eventos/{eventoId}']?.patch).toMatchObject({
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AtualizarEventoDto' },
          },
        },
      },
      responses: {
        '200': { content: { 'application/json': { schema: resumo } } },
      },
    });
    expect(document.paths['/api/v1/eventos/{eventoId}']?.get).toMatchObject({
      parameters: [
        {
          name: 'eventoId',
          in: 'path',
          required: true,
          schema: { type: 'integer', minimum: 1 },
        },
      ],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/EventoDetalheDto' },
            },
          },
        },
      },
    });
  });

  it('publica os schemas gerados das rotas de prévia e exportação final', () => {
    const previa =
      document.paths['/api/v1/eventos/{eventoId}/relatorios/final/previa']?.get;
    expect(previa).toMatchObject({
      security: [{ bearer: [] }],
      parameters: expect.arrayContaining([
        expect.objectContaining({
          name: 'eventoId',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ type: 'integer', minimum: 1 }),
        }),
        expect.objectContaining({
          name: 'busca',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'string' }),
        }),
      ]),
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/TurmaRelatorioFinalDto' },
              },
            },
          },
        },
      },
    });

    const turmaSchema = document.components?.schemas?.TurmaRelatorioFinalDto;
    const participanteSchema =
      document.components?.schemas?.ParticipanteRelatorioFinalDto;
    const presencaSchema =
      document.components?.schemas?.PresencaRelatorioFinalDto;
    expect(turmaSchema).toMatchObject({
      type: 'object',
      required: ['turma', 'totalParticipantes', 'participantes'],
      properties: {
        turma: { type: 'string', maxLength: 10 },
        totalParticipantes: { type: 'integer', minimum: 0 },
        participantes: {
          type: 'array',
          items: { $ref: '#/components/schemas/ParticipanteRelatorioFinalDto' },
        },
      },
    });
    expect(participanteSchema).toMatchObject({
      type: 'object',
      required: [
        'matricula',
        'nome',
        'grupo',
        'presencas',
        'pontoExtra',
        'turma',
      ],
      properties: {
        matricula: { type: 'string', maxLength: 20 },
        nome: { type: 'string', maxLength: 150 },
        grupo: { type: 'string', maxLength: 60 },
        presencas: {
          type: 'array',
          items: { $ref: '#/components/schemas/PresencaRelatorioFinalDto' },
        },
        pontoExtra: {
          type: 'number',
          format: 'double',
          minimum: 0,
          maximum: 1,
        },
        turma: { type: 'string', maxLength: 10 },
      },
    });
    expect(presencaSchema).toMatchObject({
      type: 'object',
      required: ['numeroDia', 'presente'],
      properties: {
        numeroDia: { type: 'integer', minimum: 1 },
        presente: { type: 'boolean' },
      },
    });
    for (const ref of [
      '#/components/schemas/TurmaRelatorioFinalDto',
      '#/components/schemas/ParticipanteRelatorioFinalDto',
      '#/components/schemas/PresencaRelatorioFinalDto',
    ]) {
      const schemaName = ref.split('/').at(-1)!;
      expect(document.components?.schemas?.[schemaName]).toBeDefined();
    }

    const exportacao =
      document.paths['/api/v1/eventos/{eventoId}/relatorios/final']?.get;
    expect(exportacao).toMatchObject({
      security: [{ bearer: [] }],
      parameters: expect.arrayContaining([
        expect.objectContaining({
          name: 'eventoId',
          in: 'path',
          required: true,
          schema: expect.objectContaining({ type: 'integer', minimum: 1 }),
        }),
        expect.objectContaining({
          name: 'formato',
          in: 'query',
          required: true,
          schema: expect.objectContaining({
            type: 'string',
            enum: ['PDF', 'XLSX'],
          }),
        }),
      ]),
      responses: {
        '200': {
          headers: { 'Content-Disposition': { schema: { type: 'string' } } },
          content: {
            'application/pdf': { schema: { type: 'string', format: 'binary' } },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
              {
                schema: { type: 'string', format: 'binary' },
              },
          },
        },
      },
    });
  });
});
