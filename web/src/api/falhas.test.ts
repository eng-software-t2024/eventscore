import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from './client.ts';
import { paraOReenvio, tipoDeFalha } from './falhas.ts';

test('só recusa de conteúdo tira o envio da fila', () => {
  assert.equal(tipoDeFalha(new ApiError(0, 'Sem conexão')), 'conexao');
  for (const status of [400, 403, 404, 409, 413, 422]) assert.equal(tipoDeFalha(new ApiError(status, 'x')), 'recusado');
  // Sessão expirada, tempo esgotado, excesso de requisições e servidor com problema: fica para tentar de novo.
  for (const status of [401, 408, 429, 500, 502, 503]) assert.equal(tipoDeFalha(new ApiError(status, 'x')), 'depois');
  assert.equal(tipoDeFalha(new Error('qualquer')), 'depois');
});

test('reenvio para nas falhas que valem para todos os envios', () => {
  for (const status of [0, 401, 429, 502, 503, 504]) assert.equal(paraOReenvio(new ApiError(status, 'x')), true, `status ${status}`);
  // Erro de um envio só (ou recusa): os outros seguem.
  for (const status of [400, 408, 422, 500]) assert.equal(paraOReenvio(new ApiError(status, 'x')), false, `status ${status}`);
  assert.equal(paraOReenvio(undefined), false);
});
