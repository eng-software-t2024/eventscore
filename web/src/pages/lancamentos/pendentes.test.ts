import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../api/client.ts';
import { aplicarColocacoesPendentes, bonusPendente, comPendente, semConexao, semPendente, type Pendentes } from './pendentes.ts';

const caminho = '/eventos/1/desafios/3/resultados';

test('novo envio para o mesmo caminho substitui o guardado', () => {
  let fila: Pendentes = {};
  fila = comPendente(fila, { caminho, corpo: [1], descricao: 'a' });
  fila = comPendente(fila, { caminho, corpo: [2], descricao: 'b' });
  fila = comPendente(fila, { caminho: '/eventos/1/bonificacoes/7', corpo: [], descricao: 'c' });
  assert.equal(Object.keys(fila).length, 2);
  assert.deepEqual(fila[caminho].corpo, [2]);
  assert.deepEqual(Object.keys(semPendente(fila, caminho)), ['/eventos/1/bonificacoes/7']);
});

test('só falta de conexão (status 0) vai para a fila', () => {
  assert.equal(semConexao(new ApiError(0, 'Sem conexão')), true);
  assert.equal(semConexao(new ApiError(422, 'Colocação repetida')), false);
  assert.equal(semConexao(new Error('qualquer')), false);
});

test('colocações guardadas aparecem por cima do que veio da API', () => {
  const daApi = [
    { id: 10, grupoId: 1, colocacao: 1, ausente: false },
    { id: 11, grupoId: 2, colocacao: 2, ausente: false },
  ];
  const guardado = {
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
  const guardado = { caminho: '/eventos/1/bonificacoes/7', corpo: [{ itemBonificacaoId: 4, valor: 8 }], descricao: 'bônus' };
  assert.deepEqual(bonusPendente(guardado), { 4: '8' });
  assert.equal(bonusPendente(undefined), undefined);
});
