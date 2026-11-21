import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  corpoColocacoes,
  juntarHistoricos,
  montarBonificacao,
  montarPenalidade,
  pontosDaColocacao,
  posicoesDeTodosEmpates,
  posicoesDesempate,
  validarColocacoes,
  type LinhaClassificacao,
} from './regras.ts';

const nome = (id: number) => ['', 'Alfa', 'Beta', 'Gama'][id];

test('colocações: exige colocação ou ausência e recusa repetição', () => {
  assert.equal(
    validarColocacoes(
      [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: null, ausente: true },
        { grupoId: 3, colocacao: 2, ausente: false },
      ],
      nome,
    ),
    null,
  );
  assert.match(validarColocacoes([{ grupoId: 2, colocacao: null, ausente: false }], nome)!, /Beta/);
  assert.match(
    validarColocacoes(
      [
        { grupoId: 1, colocacao: 2, ausente: false },
        { grupoId: 3, colocacao: 2, ausente: false },
      ],
      nome,
    )!,
    /Alfa e Gama .*2º/,
  );
});

test('grupo ausente vai sem colocação e não pontua', () => {
  assert.deepEqual(corpoColocacoes([{ grupoId: 1, colocacao: 3, ausente: true }]), [{ grupoId: 1, colocacao: null, ausente: true }]);
  const tabela = [
    { colocacao: 1, pontos: 100 },
    { colocacao: 2, pontos: 80 },
  ];
  assert.equal(pontosDaColocacao(2, tabela), 80);
  assert.equal(pontosDaColocacao(null, tabela), 0);
});

test('bonificação respeita o teto de cada item', () => {
  const itens = [
    { id: 1, nome: 'Uniformização', teto: 10 },
    { id: 2, nome: 'Grito', teto: 10 },
  ];
  assert.deepEqual(montarBonificacao({ 1: '10', 2: '' }, itens), {
    dados: [
      { itemBonificacaoId: 1, valor: 10 },
      { itemBonificacaoId: 2, valor: 0 },
    ],
  });
  assert.match((montarBonificacao({ 1: '11' }, itens) as { erro: string }).erro, /teto de 10/);
  assert.match((montarBonificacao({ 1: '2,5' }, itens) as { erro: string }).erro, /inteiro/);
});

test('penalidade dentro da faixa e com justificativa', () => {
  const ok = { grupoId: '2', pontos: '20', descricao: 'Atraso', justificativa: 'Chegou tarde' };
  assert.deepEqual(montarPenalidade(ok, 10, 50), { dados: { grupoId: 2, pontos: 20, descricao: 'Atraso', justificativa: 'Chegou tarde' } });
  assert.match((montarPenalidade({ ...ok, pontos: '5' }, 10, 50) as { erro: string }).erro, /entre 10 e 50/);
  assert.match((montarPenalidade({ ...ok, justificativa: ' ' }, 10, 50) as { erro: string }).erro, /justificativa/);
});

test('desempate dá posições seguidas na ordem escolhida', () => {
  assert.deepEqual(posicoesDesempate([2, 1], 3), [
    { grupoId: 2, posicao: 3 },
    { grupoId: 1, posicao: 4 },
  ]);
});

test('dois empates (2º e 5º lugar) vão juntos no mesmo envio', () => {
  const linha = (grupoId: number, posicao: number) => ({ grupoId, posicao }) as LinhaClassificacao;
  const classificacao = [linha(1, 1), linha(2, 2), linha(3, 2), linha(4, 4), linha(5, 5), linha(6, 5)];
  assert.deepEqual(posicoesDeTodosEmpates([[3, 2], [5, 6]], classificacao), [
    { grupoId: 3, posicao: 2 },
    { grupoId: 2, posicao: 3 },
    { grupoId: 5, posicao: 5 },
    { grupoId: 6, posicao: 6 },
  ]);
});

test('presentes formam 1..P sem lacunas; ausente não ocupa posição', () => {
  // Um presente em 2º e outro ausente: falta o 1º.
  assert.match(
    validarColocacoes(
      [
        { grupoId: 1, colocacao: 2, ausente: false },
        { grupoId: 2, colocacao: null, ausente: true },
      ],
      nome,
    )!,
    /única equipe presente.*1º lugar/,
  );
  // 1º e 3º com três grupos e um ausente: falta o 2º.
  assert.match(
    validarColocacoes(
      [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: 3, ausente: false },
        { grupoId: 3, colocacao: null, ausente: true },
      ],
      nome,
    )!,
    /Falta o 2º lugar/,
  );
  // Um presente em 1º e um ausente: válido. Todos ausentes: válido.
  assert.equal(
    validarColocacoes(
      [
        { grupoId: 1, colocacao: 1, ausente: false },
        { grupoId: 2, colocacao: null, ausente: true },
      ],
      nome,
    ),
    null,
  );
  assert.equal(
    validarColocacoes(
      [
        { grupoId: 1, colocacao: null, ausente: true },
        { grupoId: 2, colocacao: null, ausente: true },
      ],
      nome,
    ),
    null,
  );
});

test('histórico do bônus: junta os itens em ordem de data, marcando o item', () => {
  const h = (dataHora: string, valorNovo: string) => ({ dataHora, usuario: 'Admin', operacao: 'UPDATE', valorAnterior: null, valorNovo });
  assert.deepEqual(
    juntarHistoricos([
      { rotulo: 'Uniformização', itens: [h('2026-11-23T10:00:00Z', 'valor=5'), h('2026-11-23T12:00:00Z', 'valor=8')] },
      { rotulo: 'Grito de guerra', itens: [h('2026-11-23T11:00:00Z', 'valor=10')] },
    ]).map((x) => `${x.rotulo} ${x.valorNovo}`),
    ['Uniformização valor=5', 'Grito de guerra valor=10', 'Uniformização valor=8'],
  );
  assert.deepEqual(juntarHistoricos([]), []);
});
