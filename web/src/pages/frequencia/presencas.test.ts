import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../api/client.ts';
import { LIMITE_REENVIO_AUTOMATICO_MS } from '../../api/falhas.ts';
import {
  aplicarPendentes,
  chaveDasPendentes,
  descartarFormatoAntigo,
  diaInicial,
  filtrar,
  gravarPendentes,
  guardarAoFalhar,
  lerPendentes,
  marcacaoAntiga,
  pendentesDeOutraAba,
  resumo,
  type Presenca,
} from './presencas.ts';

const criadoEm = '2026-11-26T14:00:00.000Z';
const m = (presente: boolean) => ({ presente, criadoEm });

const p = (participanteId: number, nome: string, grupoId: number, presente: boolean): Presenca => ({
  participanteId,
  matricula: `2026-${100 + participanteId}`,
  nome,
  turma: 'ES',
  grupoId,
  grupo: `G${grupoId}`,
  presente,
});
const dados = [p(1, 'Lucas Vitorino', 1, true), p(2, 'Sofia Moreira', 1, false), p(3, 'Árthur Pires', 2, false)];

test('marcação pendente vale por cima da API', () => {
  const r = aplicarPendentes(dados, { 2: m(true), 1: m(false) });
  assert.deepEqual(
    r.map((x) => x.presente),
    [false, true, false],
  );
  assert.equal(dados[0].presente, true, 'não altera a lista original');
});

test('filtra por grupo e por nome ou matrícula, sem diferenciar maiúsculas', () => {
  assert.deepEqual(
    filtrar(dados, '1', '').map((x) => x.participanteId),
    [1, 2],
  );
  assert.deepEqual(
    filtrar(dados, '', 'árTHUR').map((x) => x.participanteId),
    [3],
  );
  assert.deepEqual(
    filtrar(dados, '', '2026-102').map((x) => x.participanteId),
    [2],
  );
});

test('resumo conta presentes e ausentes', () => {
  assert.deepEqual(resumo(dados), { total: 3, presentes: 1, ausentes: 2 });
  assert.deepEqual(resumo([]), { total: 0, presentes: 0, ausentes: 0 });
});

test('abre no dia de hoje quando ele é dia do evento', () => {
  const dias = [
    { id: 1, data: '2026-11-23' },
    { id: 2, data: '2026-11-24' },
  ];
  assert.equal(diaInicial(dias, '2026-11-24')?.id, 2);
  assert.equal(diaInicial(dias, '2026-11-08')?.id, 1);
  assert.equal(diaInicial([], '2026-11-08'), undefined);
});

test('falha que passa sozinha guarda a marcação; recusa de conteúdo desfaz', () => {
  for (const status of [0, 401, 408, 429, 500, 502, 503]) assert.equal(guardarAoFalhar(new ApiError(status, 'x')), true, `status ${status}`);
  for (const status of [400, 403, 404, 409, 422]) assert.equal(guardarAoFalhar(new ApiError(status, 'x')), false, `status ${status}`);
});

test('pendências são separadas por evento, usuário e dia, mesmo sem armazenamento no navegador', () => {
  const ana = { eventoId: 901, usuarioId: 1, diaId: 1 };
  gravarPendentes(ana, { 7: m(true) });
  gravarPendentes({ ...ana, diaId: 2 }, { 7: m(false) });
  assert.deepEqual(lerPendentes(ana), { 7: m(true) });
  assert.deepEqual(lerPendentes({ ...ana, diaId: 2 }), { 7: m(false) });
  // Outra pessoa no mesmo navegador não vê (nem reenvia) o que a Ana marcou.
  assert.deepEqual(lerPendentes({ ...ana, usuarioId: 2 }), {});
  assert.notEqual(chaveDasPendentes(ana), chaveDasPendentes({ ...ana, usuarioId: 2 }));
  gravarPendentes(ana, {});
  assert.deepEqual(lerPendentes(ana), {});
});

test('marcação guardada há mais de 2 horas não sai sozinha', () => {
  const guardada = m(true);
  const t = Date.parse(guardada.criadoEm);
  assert.equal(marcacaoAntiga(guardada, t + LIMITE_REENVIO_AUTOMATICO_MS), false);
  assert.equal(marcacaoAntiga(guardada, t + LIMITE_REENVIO_AUTOMATICO_MS + 1), true);
});

test('aba vê as pendências do dia como a outra aba deixou', () => {
  const alvo = { eventoId: 902, usuarioId: 1, diaId: 1 };
  const k = chaveDasPendentes(alvo);
  // A outra aba enviou tudo: a chave some.
  assert.deepEqual(pendentesDeOutraAba({ key: k, newValue: null }, alvo), {});
  // A outra aba guardou uma marcação.
  assert.deepEqual(pendentesDeOutraAba({ key: k, newValue: JSON.stringify({ 7: m(true) }) }, alvo), { 7: m(true) });
  // localStorage.clear() em outra aba.
  assert.deepEqual(pendentesDeOutraAba({ key: null, newValue: null }, alvo), {});
  // Outro usuário, outro dia ou conteúdo ilegível: não mexe na tela.
  assert.equal(pendentesDeOutraAba({ key: chaveDasPendentes({ ...alvo, usuarioId: 2 }), newValue: '{}' }, alvo), undefined);
  assert.equal(pendentesDeOutraAba({ key: chaveDasPendentes({ ...alvo, diaId: 2 }), newValue: '{}' }, alvo), undefined);
  assert.equal(pendentesDeOutraAba({ key: k, newValue: '{' }, alvo), undefined);
});

test('pendências do formato antigo (sem usuário) são descartadas; as novas ficam', () => {
  const dados = new Map([
    ['eventscore.presencas.5.3', '{"7":true}'],
    ['eventscore.presencas.5.1.3', JSON.stringify({ 7: m(true) })],
    ['eventscore.lancamentos.5.1', '{}'],
  ]);
  const armazenamento = {
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => void dados.delete(k),
  };
  descartarFormatoAntigo(armazenamento);
  assert.deepEqual([...dados.keys()], ['eventscore.presencas.5.1.3', 'eventscore.lancamentos.5.1']);
});
