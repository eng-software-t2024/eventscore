import {
  BadRequestException,
  ParseArrayPipe,
  ValidationPipe,
} from '@nestjs/common';
import { ResultadoParamsDto } from './resultado-params.dto.js';
import { SalvarResultadoDto } from './salvar-resultado.dto.js';

const pipeItem = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  stopAtFirstError: false,
  transformOptions: { enableImplicitConversion: false },
});

const pipeArray = new ParseArrayPipe({
  items: SalvarResultadoDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: false,
  transformOptions: { enableImplicitConversion: false },
});

describe('SalvarResultadoDto', () => {
  it('aceita item presente e item ausente com colocacao null', async () => {
    const presente = await pipeItem.transform(
      { grupoId: 1, colocacao: 1, ausente: false },
      { type: 'body', metatype: SalvarResultadoDto },
    );
    const ausente = await pipeItem.transform(
      { grupoId: 2, colocacao: null, ausente: true },
      { type: 'body', metatype: SalvarResultadoDto },
    );

    expect(presente).toEqual({ grupoId: 1, colocacao: 1, ausente: false });
    expect(ausente).toEqual({ grupoId: 2, colocacao: null, ausente: true });
  });

  it('aceita array válido via ParseArrayPipe', async () => {
    const lista = await pipeArray.transform(
      [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: null, ausente: true },
      ],
      { type: 'body', metatype: Array },
    );

    expect(lista).toHaveLength(2);
  });

  it.each([
    { colocacao: 1, ausente: false },
    { grupoId: 1, ausente: true },
    { grupoId: 1, colocacao: 1 },
    { grupoId: 0, colocacao: 1, ausente: false },
    { grupoId: 2_147_483_648, colocacao: 1, ausente: false },
    { grupoId: '1', colocacao: 1, ausente: false },
    { grupoId: 1, colocacao: '1', ausente: false },
    { grupoId: 1, colocacao: 0, ausente: false },
    { grupoId: 1, colocacao: 1.5, ausente: false },
    { grupoId: 1, colocacao: 2_147_483_648, ausente: false },
    { grupoId: 1, colocacao: null, ausente: 'true' },
    { grupoId: 1, colocacao: null, ausente: null },
    { grupoId: 1, colocacao: 1, ausente: false, pontos: 100 },
    { grupoId: 1, colocacao: 1, ausente: false, id: 10 },
  ])('rejeita item fora do contrato: %o', async (payload) => {
    await expect(
      pipeItem.transform(payload, {
        type: 'body',
        metatype: SalvarResultadoDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([null, {}, 'texto', 123, [null], [123]])(
    'rejeita corpo não-array ou itens não-objeto no ParseArrayPipe: %j',
    async (body) => {
      await expect(
        pipeArray.transform(body, { type: 'body', metatype: Array }),
      ).rejects.toThrow(BadRequestException);
    },
  );
});

describe('ResultadoParamsDto', () => {
  it('converte eventoId e desafioId inteiros positivos válidos', async () => {
    const params = (await pipeItem.transform(
      { eventoId: '1', desafioId: '2147483647' },
      { type: 'param', metatype: ResultadoParamsDto },
    )) as ResultadoParamsDto;

    expect(params).toEqual({ eventoId: 1, desafioId: 2_147_483_647 });
  });

  it.each([
    { eventoId: '0', desafioId: '1' },
    { eventoId: '1', desafioId: '0' },
    { eventoId: 'abc', desafioId: '1' },
    { eventoId: '1', desafioId: '2147483648' },
  ])('rejeita parâmetros inválidos: %o', async (params) => {
    await expect(
      pipeItem.transform(params, {
        type: 'param',
        metatype: ResultadoParamsDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
