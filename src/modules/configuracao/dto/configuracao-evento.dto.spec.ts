import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { TipoCriterioDesempate } from '../../../common/enums/tipo-criterio-desempate.enum.js';
import { ConfiguracaoEventoDto } from './configuracao-evento.dto.js';

// Mesmas opções do ValidationPipe registrado em main.ts.
const pipeGlobal = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  stopAtFirstError: false,
  transformOptions: { enableImplicitConversion: false },
});

const configuracaoValida = () => ({
  conversaoPontoExtra: [
    { colocacao: 1, pontoExtra: 1 },
    { colocacao: 2, pontoExtra: 0.8 },
  ],
  itensBonificacao: [
    { id: 1, nome: 'Uniformização', teto: 10 },
    { nome: 'Grito de guerra', teto: 10 },
  ],
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
      tipo: 'MAIOR_PONTUACAO_DESAFIO',
      desafioId: 3,
      descricao: 'Maior pontuação na Maratona',
    },
    {
      ordem: 2,
      tipo: 'MAIOR_BONIFICACAO',
      desafioId: null,
      descricao: 'Maior bonificação',
    },
  ],
});

async function transformar(body: unknown): Promise<ConfiguracaoEventoDto> {
  return (await pipeGlobal.transform(body, {
    type: 'body',
    metatype: ConfiguracaoEventoDto,
  })) as ConfiguracaoEventoDto;
}

async function mensagens(body: unknown): Promise<string[]> {
  try {
    await transformar(body);
  } catch (erro) {
    expect(erro).toBeInstanceOf(BadRequestException);
    const resposta = (erro as BadRequestException).getResponse() as {
      message: string[];
    };
    return resposta.message;
  }
  throw new Error('payload deveria ser recusado');
}

describe('ConfiguracaoEventoDto', () => {
  it('aceita a configuração completa', async () => {
    const dto = await transformar(configuracaoValida());

    expect(dto).toBeInstanceOf(ConfiguracaoEventoDto);
    expect(dto.criteriosDesempate[0].tipo).toBe(
      TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
    );
  });

  it('aceita evento sem configuração: listas vazias e faixa nula', async () => {
    await expect(
      transformar({
        conversaoPontoExtra: [],
        itensBonificacao: [],
        penalidadeMin: null,
        penalidadeMax: null,
        fatoresPresenca: [],
        criteriosDesempate: [],
      }),
    ).resolves.toBeInstanceOf(ConfiguracaoEventoDto);
  });

  it('remove espaços externos de nome do item e descrição do critério', async () => {
    const body = configuracaoValida();
    body.itensBonificacao[0].nome = '  Uniformização  ';
    body.criteriosDesempate[1].descricao = '  Maior bonificação ';

    const dto = await transformar(body);

    expect(dto.itensBonificacao[0].nome).toBe('Uniformização');
    expect(dto.criteriosDesempate[1].descricao).toBe('Maior bonificação');
  });

  it('aceita critério sem desafioId', async () => {
    const body = configuracaoValida();
    delete (body.criteriosDesempate[1] as { desafioId?: unknown }).desafioId;

    await expect(transformar(body)).resolves.toBeInstanceOf(
      ConfiguracaoEventoDto,
    );
  });

  it.each([
    'conversaoPontoExtra',
    'itensBonificacao',
    'penalidadeMin',
    'penalidadeMax',
    'fatoresPresenca',
    'criteriosDesempate',
  ])('recusa payload sem %s', async (campo) => {
    const body: Record<string, unknown> = configuracaoValida();
    delete body[campo];

    const erros = await mensagens(body);

    expect(erros.some((m) => m.startsWith(campo))).toBe(true);
  });

  it('recusa campos fora do contrato', async () => {
    const erros = await mensagens({ ...configuracaoValida(), extra: true });

    expect(erros).toContain('property extra should not exist');
  });

  describe('conversão em ponto extra', () => {
    it.each<[unknown, string]>([
      [0.85, 'mais de uma casa decimal'],
      [1.1, 'acima de 1'],
      [-0.1, 'negativo'],
      ['0.8', 'texto'],
    ])('recusa pontoExtra %s (%s)', async (pontoExtra, _motivo) => {
      const body = configuracaoValida();
      (body.conversaoPontoExtra[1] as { pontoExtra: unknown }).pontoExtra =
        pontoExtra;

      const erros = await mensagens(body);

      expect(
        erros.some((m) => m.startsWith('conversaoPontoExtra.1.pontoExtra')),
      ).toBe(true);
    });

    it.each([0, 1.5, 2_147_483_648])(
      'recusa colocação %s',
      async (colocacao) => {
        const body = configuracaoValida();
        body.conversaoPontoExtra[0].colocacao = colocacao;

        const erros = await mensagens(body);

        expect(
          erros.some((m) => m.startsWith('conversaoPontoExtra.0.colocacao')),
        ).toBe(true);
      },
    );
  });

  describe('itens de bonificação', () => {
    it.each(['', '   ', 'A'.repeat(151)])(
      'recusa nome inválido (%j)',
      async (nome) => {
        const body = configuracaoValida();
        body.itensBonificacao[0].nome = nome;

        const erros = await mensagens(body);

        expect(erros.some((m) => m.startsWith('itensBonificacao.0.nome'))).toBe(
          true,
        );
      },
    );

    it('aceita teto zero e recusa teto negativo ou fracionário', async () => {
      const comZero = configuracaoValida();
      comZero.itensBonificacao[0].teto = 0;
      await expect(transformar(comZero)).resolves.toBeInstanceOf(
        ConfiguracaoEventoDto,
      );

      for (const teto of [-1, 2.5]) {
        const body = configuracaoValida();
        body.itensBonificacao[0].teto = teto;
        const erros = await mensagens(body);
        expect(erros.some((m) => m.startsWith('itensBonificacao.0.teto'))).toBe(
          true,
        );
      }
    });

    it.each([null, 0, 'abc'])('recusa id %j', async (id) => {
      const body = configuracaoValida();
      (body.itensBonificacao[0] as { id: unknown }).id = id;

      const erros = await mensagens(body);

      expect(erros.some((m) => m.startsWith('itensBonificacao.0.id'))).toBe(
        true,
      );
    });
  });

  describe('faixa de penalidade', () => {
    it.each([
      ['penalidadeMin', -1],
      ['penalidadeMin', 10.5],
      ['penalidadeMax', '50'],
    ])('recusa %s = %j', async (campo, valor) => {
      const body: Record<string, unknown> = configuracaoValida();
      body[campo] = valor;

      const erros = await mensagens(body);

      expect(erros.some((m) => m.startsWith(campo))).toBe(true);
    });
  });

  describe('fatores de presença', () => {
    it('aceita fator com quatro casas decimais', async () => {
      const body = configuracaoValida();
      body.fatoresPresenca[1].fator = 0.3333;

      await expect(transformar(body)).resolves.toBeInstanceOf(
        ConfiguracaoEventoDto,
      );
    });

    it.each([1.01, -0.5, 0.12345])('recusa fator %s', async (fator) => {
      const body = configuracaoValida();
      body.fatoresPresenca[1].fator = fator;

      const erros = await mensagens(body);

      expect(erros.some((m) => m.startsWith('fatoresPresenca.1.fator'))).toBe(
        true,
      );
    });

    it('recusa diasPresentes negativo', async () => {
      const body = configuracaoValida();
      body.fatoresPresenca[0].diasPresentes = -1;

      const erros = await mensagens(body);

      expect(
        erros.some((m) => m.startsWith('fatoresPresenca.0.diasPresentes')),
      ).toBe(true);
    });
  });

  describe('critérios de desempate', () => {
    it('recusa tipo fora da V12, inclusive MAIOR_PRESENCA', async () => {
      const body = configuracaoValida();
      body.criteriosDesempate[1].tipo = 'MAIOR_PRESENCA';

      const erros = await mensagens(body);

      expect(erros.some((m) => m.startsWith('criteriosDesempate.1.tipo'))).toBe(
        true,
      );
    });

    it.each([
      ['ordem', 0],
      ['desafioId', 0],
      ['descricao', '  '],
      ['descricao', 'A'.repeat(256)],
    ])('recusa %s = %j', async (campo, valor) => {
      const body = configuracaoValida();
      (body.criteriosDesempate[0] as Record<string, unknown>)[campo] = valor;

      const erros = await mensagens(body);

      expect(
        erros.some((m) => m.startsWith(`criteriosDesempate.0.${campo}`)),
      ).toBe(true);
    });
  });

  it.each([
    'conversaoPontoExtra',
    'itensBonificacao',
    'fatoresPresenca',
    'criteriosDesempate',
  ])('recusa %s com item que não é objeto', async (campo) => {
    const body: Record<string, unknown> = configuracaoValida();
    body[campo] = [null];

    const erros = await mensagens(body);

    expect(erros.some((m) => m.startsWith(campo))).toBe(true);
  });
});
