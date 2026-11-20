import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from './client.ts';
import { tipoDeFalha } from './falhas.ts';

test('só recusa de conteúdo tira o envio da fila', () => {
  assert.equal(tipoDeFalha(new ApiError(0, 'Sem conexão')), 'conexao');
  for (const status of [400, 403, 404, 409, 413, 422]) assert.equal(tipoDeFalha(new ApiError(status, 'x')), 'recusado');
  // Sessão expirada, tempo esgotado, excesso de requisições e servidor com problema: fica para tentar de novo.
  for (const status of [401, 408, 429, 500, 502, 503]) assert.equal(tipoDeFalha(new ApiError(status, 'x')), 'depois');
  assert.equal(tipoDeFalha(new Error('qualquer')), 'depois');
});
