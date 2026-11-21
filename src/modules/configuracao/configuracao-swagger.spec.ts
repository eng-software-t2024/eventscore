import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { configurarSwagger } from '../../config/swagger.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfiguracaoModule } from './configuracao.module.js';

describe('Swagger da configuração do evento', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, ConfiguracaoModule],
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

  it('publica GET e PUT com os operationIds e status do contrato v0.2', () => {
    const rota = document.paths['/api/v1/eventos/{eventoId}/configuracao'];

    expect(rota.get?.operationId).toBe('obterConfiguracaoEvento');
    expect(rota.put?.operationId).toBe('salvarConfiguracaoEvento');
    expect(Object.keys(rota.get?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
    ]);
    expect(Object.keys(rota.put?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '409',
      '422',
    ]);
    expect(rota.put?.tags).toEqual(['Configuração']);
  });

  it('publica os schemas com os nomes e restrições do contrato', () => {
    expect(document.components?.schemas).toMatchObject({
      ConfiguracaoEventoDto: {
        required: [
          'conversaoPontoExtra',
          'itensBonificacao',
          'penalidadeMin',
          'penalidadeMax',
          'fatoresPresenca',
          'criteriosDesempate',
        ],
        properties: {
          penalidadeMin: { type: 'integer', nullable: true, minimum: 0 },
          penalidadeMax: { type: 'integer', nullable: true, minimum: 0 },
        },
      },
      ConversaoPontoExtraItemDto: {
        required: ['colocacao', 'pontoExtra'],
        properties: { pontoExtra: { minimum: 0, maximum: 1 } },
      },
      ItemBonificacaoConfigDto: {
        required: ['nome', 'teto'],
        properties: { teto: { minimum: 0 }, nome: { maxLength: 150 } },
      },
      FatorPresencaItemDto: {
        required: ['diasPresentes', 'fator'],
        properties: { fator: { minimum: 0, maximum: 1 } },
      },
      CriterioDesempateConfigDto: {
        required: ['ordem', 'tipo', 'descricao'],
        properties: { desafioId: { nullable: true } },
      },
      TipoCriterioDesempate: {
        enum: [
          'MAIOR_PONTUACAO_DESAFIO',
          'MAIOR_SOMA_DESAFIOS',
          'MAIOR_BONIFICACAO',
          'MENOR_PENALIDADE',
        ],
      },
    });
  });
});
