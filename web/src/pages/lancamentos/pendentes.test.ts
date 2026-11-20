import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aplicarColocacoesPendentes,
  bonusPendente,
  chaveDaFila,
  comPendente,
  envioAntigo,
  LIMITE_REENVIO_AUTOMATICO_MS,
  pendentesDeOutraAba,
  semPendente,
  telaMostraRecusado,
  type EnvioPendente,
  type Pendentes,
} from './pendentes.ts';

const caminho = '/eventos/1/desafios/3/resultados';
const envio = (id: string, outros: Partial<EnvioPendente> = {}): EnvioPendente => ({
  id,
  caminho,
  corpo: [],
  descricao: id,
  criadoEm: '2026-11-26T14:00:00.000Z',
  ...outros,
});

test('cada usuário tem a própria fila no mesmo evento', () => {
  assert.notEqual(chaveDaFila({ eventoId: 1, usuarioId: 7 }), chaveDaFila({ eventoId: 1, usuarioId: 8 }));
  assert.notEqual(chaveDaFila({ eventoId: 1, usuarioId: 7 }), chaveDaFila({ eventoId: 2, usuarioId: 7 }));
});

test('novo envio para o mesmo caminho substitui o guardado', () => {
  let fila: Pendentes = {};
  fila = comPendente(fila, envio('a', { corpo: [1] }));
  fila = comPendente(fila, envio('b', { corpo: [2] }));
  fila = comPendente(fila, envio('c', { caminho: '/eventos/1/bonificacoes/7' }));
  assert.equal(Object.keys(fila).length, 2);
  assert.deepEqual(fila[caminho].corpo, [2]);
});

test('reenvio antigo concluído não apaga o envio mais novo do mesmo caminho', () => {
  const fila: Pendentes = { [caminho]: envio('novo') };
  assert.equal(semPendente(fila, { caminho, id: 'antigo' }), fila);
  assert.deepEqual(semPendente(fila, { caminho, id: 'novo' }), {});
});

test('envio guardado há mais de 2 horas não sai sozinho', () => {
  const guardado = envio('a');
  const criado = Date.parse(guardado.criadoEm);
  assert.equal(envioAntigo(guardado, criado + LIMITE_REENVIO_AUTOMATICO_MS), false);
  assert.equal(envioAntigo(guardado, criado + LIMITE_REENVIO_AUTOMATICO_MS + 1), true);
});

test('colocações guardadas aparecem por cima do que veio da API', () => {
  const daApi = [
    { id: 10, grupoId: 1, colocacao: 1, ausente: false },
    { id: 11, grupoId: 2, colocacao: 2, ausente: false },
  ];
  const guardado = envio('a', {
    corpo: [
      { grupoId: 1, colocacao: 2, ausente: false },
      { grupoId: 2, colocacao: null, ausente: true },
    ],
  });
  assert.deepEqual(aplicarColocacoesPendentes(daApi, guardado), [
    { id: 10, grupoId: 1, colocacao: 2, ausente: false },
    { id: 11, grupoId: 2, colocacao: null, ausente: true },
  ]);
  assert.equal(aplicarColocacoesPendentes(daApi, undefined), daApi);
});

test('bônus guardado volta no formato da tela', () => {
  assert.deepEqual(bonusPendente(envio('a', { caminho: '/eventos/1/bonificacoes/7', corpo: [{ itemBonificacaoId: 4, valor: 8 }] })), { 4: '8' });
  assert.equal(bonusPendente(undefined), undefined);
});

test('aba sem conexão vê a fila esvaziar quando outra aba envia o lançamento', () => {
  const fila = { eventoId: 1, usuarioId: 7 };
  const chave = chaveDaFila(fila);
  // Aba A guardou um bônus sem conexão; aba B enviou e apagou a chave (removeItem: newValue nulo).
  const naAbaA: Pendentes = comPendente({}, envio('bonus'));
  assert.equal(Object.keys(naAbaA).length, 1);
  assert.deepEqual(pendentesDeOutraAba({ key: chave, newValue: null }, fila), {});
});

test('aba recebe o que outra aba guardou na mesma fila', () => {
  const fila = { eventoId: 1, usuarioId: 7 };
  const guardado = comPendente({}, envio('b'));
  assert.deepEqual(pendentesDeOutraAba({ key: chaveDaFila(fila), newValue: JSON.stringify(guardado) }, fila), guardado);
});

test('mudança na fila de outro usuário ou evento não mexe na fila da tela', () => {
  const fila = { eventoId: 1, usuarioId: 7 };
  const outra = JSON.stringify(comPendente({}, envio('x')));
  assert.equal(pendentesDeOutraAba({ key: chaveDaFila({ eventoId: 1, usuarioId: 8 }), newValue: outra }, fila), undefined);
  assert.equal(pendentesDeOutraAba({ key: chaveDaFila({ eventoId: 2, usuarioId: 7 }), newValue: outra }, fila), undefined);
  assert.equal(pendentesDeOutraAba({ key: chaveDaFila(fila), newValue: '{quebrado' }, fila), undefined);
});

test('localStorage.clear() em outra aba esvazia a fila da tela', () => {
  assert.deepEqual(pendentesDeOutraAba({ key: null, newValue: null }, { eventoId: 1, usuarioId: 7 }), {});
});

test('valor recusado no reenvio só sai da tela se ela ainda mostra exatamente ele', () => {
  const recusado = envio('a', { corpo: [{ grupoId: 1, colocacao: 1, ausente: false }] });
  assert.equal(telaMostraRecusado([{ grupoId: 1, colocacao: 1, ausente: false }], recusado), true);
  // O usuário já corrigiu depois do envio: o que ele digitou fica.
  assert.equal(telaMostraRecusado([{ grupoId: 1, colocacao: 2, ausente: false }], recusado), false);
});
