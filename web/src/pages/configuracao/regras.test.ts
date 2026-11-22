import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criteriosValidos, montarConfiguracao, paraFormulario, pendenciaConfiguracao, persistirConfiguracao, type Configuracao } from './regras.ts';

const exemplo: Configuracao = {
  conversaoPontoExtra: [
    { colocacao: 1, pontoExtra: 1 },
    { colocacao: 2, pontoExtra: 0.8 },
  ],
  itensBonificacao: [{ id: 1, nome: 'Uniformização', teto: 10 }],
  penalidadeMin: 10,
  penalidadeMax: 50,
  fatoresPresenca: [
    { diasPresentes: 2, fator: 1 },
    { diasPresentes: 1, fator: 0.5 },
    { diasPresentes: 0, fator: 0 },
  ],
  criteriosDesempate: [
    { ordem: 2, tipo: 'MENOR_PENALIDADE', desafioId: null, descricao: 'x' },
    { ordem: 1, tipo: 'MAIOR_PONTUACAO_DESAFIO', desafioId: 3, descricao: 'y' },
  ],
};
const desafios = [{ id: 3, nome: 'Hackathon' }];

test('formulário tem uma linha por grupo e por quantidade de dias presentes', () => {
  const f = paraFormulario(exemplo, 3, 2);
  assert.deepEqual(f.conversao, ['1', '0,8', '']);
  assert.deepEqual(f.fatores, ['0', '50', '100']);
  assert.deepEqual(
    f.criterios.map((c) => c.tipo),
    ['MAIOR_PONTUACAO_DESAFIO', 'MENOR_PENALIDADE'],
  );
});

test('ida e volta devolve a mesma configuração, com ordem e descrição geradas', () => {
  const r = montarConfiguracao(paraFormulario(exemplo, 2, 2), desafios);
  assert.ok('dados' in r);
  assert.deepEqual(r.dados.conversaoPontoExtra, exemplo.conversaoPontoExtra);
  assert.deepEqual(r.dados.fatoresPresenca, [...exemplo.fatoresPresenca].reverse());
  assert.deepEqual(r.dados.criteriosDesempate, [
    { ordem: 1, tipo: 'MAIOR_PONTUACAO_DESAFIO', desafioId: 3, descricao: 'Maior pontuação em Hackathon' },
    { ordem: 2, tipo: 'MENOR_PENALIDADE', desafioId: null, descricao: 'Menor penalidade' },
  ]);
});

test('aponta o primeiro erro de preenchimento', () => {
  const base = paraFormulario(exemplo, 2, 2);
  const erro = (mudanca: object) => {
    const r = montarConfiguracao({ ...base, ...mudanca }, desafios);
    return 'erro' in r ? r.erro : '';
  };
  assert.match(erro({ conversao: ['1', ''] }), /2º lugar/);
  assert.match(erro({ itens: [{ nome: 'Grito', teto: '0' }] }), /teto/);
  assert.match(erro({ penalidadeMin: '60' }), /mínima/);
  assert.match(erro({ fatores: ['0', '150', '100'] }), /entre 0% e 100%/);
  assert.match(erro({ criterios: [{ tipo: 'MAIOR_PONTUACAO_DESAFIO', desafioId: null }] }), /desafio/);
});

test('carrega e salva a configuração inicial sem faixa, sem converter campo vazio em zero', () => {
  const inicial: Configuracao = {
    conversaoPontoExtra: [],
    itensBonificacao: [],
    penalidadeMin: null,
    penalidadeMax: null,
    fatoresPresenca: [],
    criteriosDesempate: [],
  };
  const formulario = paraFormulario(inicial, 2, 1);
  assert.equal(formulario.penalidadeMin, '');
  assert.equal(formulario.penalidadeMax, '');

  const pronto = {
    ...formulario,
    conversao: ['1', '0,5'],
    fatores: ['0', '100'],
  };
  const resultado = montarConfiguracao(pronto, []);
  assert.ok('dados' in resultado);
  assert.equal(resultado.dados.penalidadeMin, null);
  assert.equal(resultado.dados.penalidadeMax, null);
  assert.deepEqual(resultado.dados.conversaoPontoExtra, [
    { colocacao: 1, pontoExtra: 1 },
    { colocacao: 2, pontoExtra: 0.5 },
  ]);
  assert.deepEqual(resultado.dados.fatoresPresenca, [
    { diasPresentes: 0, fator: 0 },
    { diasPresentes: 1, fator: 1 },
  ]);
});

test('aceita limites ambos vazios ou uma faixa inteira válida', () => {
  const formulario = paraFormulario(exemplo, 2, 2);
  const semFaixa = montarConfiguracao({ ...formulario, penalidadeMin: ' ', penalidadeMax: '' }, desafios);
  assert.ok('dados' in semFaixa);
  assert.equal(semFaixa.dados.penalidadeMin, null);
  assert.equal(semFaixa.dados.penalidadeMax, null);

  const faixa = montarConfiguracao({ ...formulario, penalidadeMin: '0', penalidadeMax: '50' }, desafios);
  assert.ok('dados' in faixa);
  assert.equal(faixa.dados.penalidadeMin, 0);
  assert.equal(faixa.dados.penalidadeMax, 50);
});

test('rejeita limite parcial, faixa invertida e valores não inteiros', () => {
  const formulario = paraFormulario(exemplo, 2, 2);
  const erro = (penalidadeMin: string, penalidadeMax: string) => {
    const resultado = montarConfiguracao({ ...formulario, penalidadeMin, penalidadeMax }, desafios);
    return 'erro' in resultado ? resultado.erro : '';
  };
  assert.match(erro('', '50'), /ambos em branco/);
  assert.match(erro('10', ''), /ambos em branco/);
  assert.match(erro('51', '50'), /mínima/);
  assert.match(erro('10,5', '50'), /números inteiros/);
  assert.match(erro('-1', '50'), /números inteiros/);
});

test('preserva a recusa do backend e não relata sucesso quando a API bloqueia a gravação', async () => {
  const resultado = montarConfiguracao(
    { ...paraFormulario(exemplo, 2, 2), penalidadeMin: '', penalidadeMax: '' },
    desafios,
  );
  assert.ok('dados' in resultado);

  const envio = await persistirConfiguracao(resultado.dados, async () => {
    throw Object.assign(new Error('Não é possível remover a faixa de penalidade porque já há penalidade lançada.'), {
      status: 422,
    });
  });
  assert.deepEqual(envio, {
    sucesso: false,
    erro: 'Não é possível remover a faixa de penalidade porque já há penalidade lançada.',
  });
});

test('critério de tipo que saiu do contrato é descartado', () => {
  const antiga = {
    ...exemplo,
    criteriosDesempate: [...exemplo.criteriosDesempate, { ordem: 3, tipo: 'MAIOR_PRESENCA', desafioId: null, descricao: 'x' }],
  } as unknown as Configuracao;
  assert.equal(criteriosValidos(antiga).length, 2);
  assert.deepEqual(
    paraFormulario(antiga, 2, 2).criterios.map((c) => c.tipo),
    ['MAIOR_PONTUACAO_DESAFIO', 'MENOR_PENALIDADE'],
  );
});

test('aponta o que falta na configuração salva para os grupos e dias atuais', () => {
  // exemplo: conversão para 2 colocações; fatores conforme o objeto de exemplo.
  const completa = { ...exemplo, fatoresPresenca: [0, 1, 2].map((d) => ({ diasPresentes: d, fator: d / 2 })) };
  assert.equal(pendenciaConfiguracao(completa, 2, 2), null);
  assert.match(pendenciaConfiguracao(completa, 3, 2) ?? '', /falta a conversão da 3ª colocação\./);
  assert.match(pendenciaConfiguracao(completa, 2, 3) ?? '', /falta o fator para 3 dias presentes\./);
  assert.match(pendenciaConfiguracao(completa, 5, 2) ?? '', /falta a conversão das 3ª, 4ª e 5ª colocações\./);
  const semFator1 = { ...completa, fatoresPresenca: completa.fatoresPresenca.filter((f) => f.diasPresentes !== 1) };
  assert.match(pendenciaConfiguracao(semFator1, 3, 2) ?? '', /falta a conversão da 3ª colocação e o fator para 1 dia presente\./);
  const nuncaSalva = { ...completa, conversaoPontoExtra: [], fatoresPresenca: [] };
  assert.match(pendenciaConfiguracao(nuncaSalva, 2, 1) ?? '', /falta a conversão das 1ª e 2ª colocações e os fatores para 0 e 1 dias presentes\./);
});
