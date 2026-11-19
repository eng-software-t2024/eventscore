import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AtualizarDesafioDto } from './atualizar-desafio.dto.js';
import { CriarDesafioDto } from './criar-desafio.dto.js';
import {
  DesafioEventoIdParamsDto,
  DesafioParamsDto,
} from './desafio-params.dto.js';

const desafioValido = {
  nome: 'Hackathon',
  descricao: 'Desenvolvimento em equipe',
  diaId: 2,
  pontosColocacao: [
    { colocacao: 1, pontos: 100 },
    { colocacao: 2, pontos: 80 },
  ],
};

const pipeGlobal = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  stopAtFirstError: false,
  transformOptions: {
    enableImplicitConversion: false,
  },
});

describe('CriarDesafioDto', () => {
  it('aceita payload completo e payload sem descrição opcional', async () => {
    const completo = plainToInstance(CriarDesafioDto, desafioValido);
    const semDescricao = plainToInstance(CriarDesafioDto, {
      nome: 'Quiz',
      diaId: 1,
      pontosColocacao: [{ colocacao: 1, pontos: 0 }],
    });

    await expect(validate(completo)).resolves.toHaveLength(0);
    await expect(validate(semDescricao)).resolves.toHaveLength(0);
  });

  it('remove espaços externos do nome ao transformar e aceita limite de 100 caracteres', async () => {
    const transformado = (await pipeGlobal.transform(
      {
        ...desafioValido,
        nome: `  ${'A'.repeat(100)}  `,
      },
      { type: 'body', metatype: CriarDesafioDto },
    )) as CriarDesafioDto;

    expect(transformado.nome).toBe('A'.repeat(100));
  });

  it.each([
    '',
    ' ',
    '   ',
    '\t\n',
    '\u00A0\u2003 ',
    'A'.repeat(101),
    123,
    null,
  ])('rejeita nome inválido na criação: %j', async (nome) => {
    await expect(
      pipeGlobal.transform(
        { ...desafioValido, nome },
        { type: 'body', metatype: CriarDesafioDto },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([
    { ...desafioValido, descricao: null },
    { ...desafioValido, descricao: 123 },
    { ...desafioValido, descricao: 'D'.repeat(256) },
    { ...desafioValido, diaId: 0 },
    { ...desafioValido, diaId: 1.5 },
    { ...desafioValido, diaId: '2' },
    { ...desafioValido, diaId: 2_147_483_648 },
    { ...desafioValido, pontosColocacao: [] },
    { ...desafioValido, pontosColocacao: 'nao-array' },
    { ...desafioValido, pontosColocacao: [null] },
    { ...desafioValido, pontosColocacao: [123] },
    {
      ...desafioValido,
      pontosColocacao: [{ colocacao: 0, pontos: 100 }],
    },
    {
      ...desafioValido,
      pontosColocacao: [{ colocacao: 1.5, pontos: 100 }],
    },
    {
      ...desafioValido,
      pontosColocacao: [{ colocacao: 1, pontos: -1 }],
    },
    {
      ...desafioValido,
      pontosColocacao: [{ colocacao: 1, pontos: 10.5 }],
    },
    {
      ...desafioValido,
      pontosColocacao: [{ colocacao: 1, pontos: '100' }],
    },
    {
      ...desafioValido,
      peso: 2,
    },
    {
      ...desafioValido,
      pontosColocacao: [{ colocacao: 1, pontos: 100, extra: true }],
    },
  ])('rejeita campo fora do contrato: %o', async (payload) => {
    await expect(
      pipeGlobal.transform(payload, {
        type: 'body',
        metatype: CriarDesafioDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('AtualizarDesafioDto', () => {
  it('aceita atualização parcial, descrição vazia e payload vazio preservando campos ausentes', async () => {
    const parcial = (await pipeGlobal.transform(
      { nome: '  Hackathon final  ', descricao: '' },
      { type: 'body', metatype: AtualizarDesafioDto },
    )) as AtualizarDesafioDto;
    const vazio = (await pipeGlobal.transform(
      {},
      { type: 'body', metatype: AtualizarDesafioDto },
    )) as AtualizarDesafioDto;

    expect(parcial.nome).toBe('Hackathon final');
    expect(parcial.descricao).toBe('');
    expect(parcial.diaId).toBeUndefined();
    expect(parcial.pontosColocacao).toBeUndefined();
    expect(vazio).toEqual({});
  });

  it.each(['nome', 'descricao', 'diaId', 'pontosColocacao'])(
    'rejeita null explícito em %s',
    async (campo) => {
      await expect(
        pipeGlobal.transform(
          { [campo]: null },
          { type: 'body', metatype: AtualizarDesafioDto },
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each(['', '   ', '\t\n', '\u00A0', 'A'.repeat(101)])(
    'rejeita nome inválido no PATCH: %j',
    async (nome) => {
      await expect(
        pipeGlobal.transform(
          { nome },
          { type: 'body', metatype: AtualizarDesafioDto },
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );
});

describe('Parâmetros de rota de desafios', () => {
  it('converte IDs inteiros positivos dentro da faixa SQL INT', async () => {
    const evento = (await pipeGlobal.transform(
      { eventoId: '1' },
      { type: 'param', metatype: DesafioEventoIdParamsDto },
    )) as DesafioEventoIdParamsDto;
    const desafio = (await pipeGlobal.transform(
      { eventoId: '1', desafioId: '2147483647' },
      { type: 'param', metatype: DesafioParamsDto },
    )) as DesafioParamsDto;

    expect(evento.eventoId).toBe(1);
    expect(desafio.eventoId).toBe(1);
    expect(desafio.desafioId).toBe(2_147_483_647);
  });

  it.each([
    { eventoId: '0', desafioId: '1' },
    { eventoId: '1', desafioId: '0' },
    { eventoId: 'abc', desafioId: '1' },
    { eventoId: '1', desafioId: '2147483648' },
    { eventoId: '1.5', desafioId: '1' },
  ])('rejeita parâmetros inválidos: %o', async (params) => {
    await expect(
      pipeGlobal.transform(params, {
        type: 'param',
        metatype: DesafioParamsDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
