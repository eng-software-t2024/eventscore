import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../../api/client.ts';
import { LIMITE_REENVIO_AUTOMATICO_MS } from '../../api/falhas.ts';
import {
  aplicarPendentes,
  chaveDasPendentes,
  confirmarNaLista,
  descartarFormatoAntigo,
  diaInicial,
  filtrar,
  gravarPendentes,
  guardarAoFalhar,
  lerPendentes,
  marcacaoAntiga,
  marcarNaLista,
  novaListaDoDia,
  pendentesDeOutraAba,
  recarregarLista,
  recusarNaLista,
  resumo,
  sincronizarLista,
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

// Sofia (2) está ausente na API em todos os casos abaixo.
const valorDe = (l: { dados: Presenca[] }, id: number) => l.dados.find((x) => x.participanteId === id)?.presente;

test('recusa depois de uma pendência volta ao valor salvo na API, não ao anterior da tela (503 → nova marcação → 422)', () => {
  let l = novaListaDoDia(1, dados, {});
  // Marca presente; a API responde 503 e a marcação fica pendente (a lista não muda).
  l = marcarNaLista(l, 2, true);
  // Desmarca; a API responde 422.
  l = marcarNaLista(l, 2, false);
  l = recusarNaLista(l, 2, false);
  assert.equal(valorDe(l, 2), false, 'a API continua com ausente');
  // Ao contrário: presente salvo, nova marcação recusada volta para presente.
  l = confirmarNaLista(marcarNaLista(l, 2, true), 2, true);
  l = recusarNaLista(marcarNaLista(l, 2, false), 2, false);
  assert.equal(valorDe(l, 2), true);
});

test('pendência descartada em outra aba volta ao valor salvo; pendência nova de lá aparece', () => {
  const antes = { 2: m(true) };
  let l = novaListaDoDia(1, dados, antes);
  assert.equal(valorDe(l, 2), true, 'presente, não salvo');
  l = sincronizarLista(l, antes, {});
  assert.equal(valorDe(l, 2), false, 'descartada: volta para ausente, como na API');
  l = sincronizarLista(l, {}, { 3: m(true) });
  assert.equal(valorDe(l, 3), true, 'guardada na outra aba');
  assert.equal(valorDe(l, 1), true, 'quem não mudou fica igual');
});

test('lista recarregada traz o servidor, mantém pendências e o que está a caminho', () => {
  let l = novaListaDoDia(1, dados, {});
  l = marcarNaLista(l, 1, false); // a caminho
  const daApi = dados.map((x) => (x.participanteId === 2 ? { ...x, presente: true } : x)); // a outra aba salvou Sofia
  l = recarregarLista(l, daApi, { 3: m(true) }, new Set([1]));
  assert.equal(valorDe(l, 1), false, 'a caminho: fica o da tela');
  assert.equal(valorDe(l, 2), true, 'salvo pela outra aba');
  assert.equal(valorDe(l, 3), true, 'pendente');
  assert.equal(l.salvos[2], true);
  assert.equal(l.salvos[1], true, 'confirmado continua o do servidor até a resposta chegar');
});
