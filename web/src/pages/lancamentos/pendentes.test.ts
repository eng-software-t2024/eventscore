import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../api/client.ts';
import { aplicarColocacoesPendentes, bonusPendente, comPendente, semPendente, tipoDeFalha, type Pendentes } from './pendentes.ts';

const caminho = '/eventos/1/desafios/3/resultados';

test('novo envio para o mesmo caminho substitui o guardado', () => {
  let fila: Pendentes = {};
  fila = comPendente(fila, { id: 'a', caminho, corpo: [1], descricao: 'a' });
  fila = comPendente(fila, { id: 'b', caminho, corpo: [2], descricao: 'b' });
  fila = comPendente(fila, { id: 'c', caminho: '/eventos/1/bonificacoes/7', corpo: [], descricao: 'c' });
  assert.equal(Object.keys(fila).length, 2);
  assert.deepEqual(fila[caminho].corpo, [2]);
});

test('reenvio antigo concluído não apaga o envio mais novo do mesmo caminho', () => {
  const fila: Pendentes = { [caminho]: { id: 'novo', caminho, corpo: [2], descricao: 'b' } };
  assert.equal(semPendente(fila, { caminho, id: 'antigo' }), fila);
  assert.deepEqual(semPendente(fila, { caminho, id: 'novo' }), {});
});

test('só recusa de conteúdo tira o envio da fila', () => {
  assert.equal(tipoDeFalha(new ApiError(0, 'Sem conexão')), 'conexao');
  for (const status of [400, 404, 409, 422]) assert.equal(tipoDeFalha(new ApiError(status, 'x')), 'recusado');
  // Sessão expirada e servidor com problema: o envio fica para tentar de novo.
  for (const status of [401, 500, 502, 503]) assert.equal(tipoDeFalha(new ApiError(status, 'x')), 'depois');
  assert.equal(tipoDeFalha(new Error('qualquer')), 'depois');
});

test('colocações guardadas aparecem por cima do que veio da API', () => {
  const daApi = [
    { id: 10, grupoId: 1, colocacao: 1, ausente: false },
    { id: 11, grupoId: 2, colocacao: 2, ausente: false },
  ];
  const guardado = {
    id: 'a',
    caminho,
    corpo: [
      { grupoId: 1, colocacao: 2, ausente: false },
      { grupoId: 2, colocacao: null, ausente: true },
    ],
    descricao: 'colocações',
  };
  assert.deepEqual(aplicarColocacoesPendentes(daApi, guardado), [
    { id: 10, grupoId: 1, colocacao: 2, ausente: false },
    { id: 11, grupoId: 2, colocacao: null, ausente: true },
  ]);
  assert.equal(aplicarColocacoesPendentes(daApi, undefined), daApi);
});

test('bônus guardado volta no formato da tela', () => {
  const guardado = { id: 'a', caminho: '/eventos/1/bonificacoes/7', corpo: [{ itemBonificacaoId: 4, valor: 8 }], descricao: 'bônus' };
  assert.deepEqual(bonusPendente(guardado), { 4: '8' });
  assert.equal(bonusPendente(undefined), undefined);
});
