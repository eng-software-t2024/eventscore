import assert from 'node:assert/strict';
import { test } from 'node:test';
import { camposAlterados, montarDesafio, paraFormulario, type Desafio } from './regras.ts';

const hackathon: Desafio = {
  id: 3,
  nome: 'Hackathon',
  descricao: '6 horas',
  diaId: 2,
  pontosColocacao: [
    { colocacao: 1, pontos: 100 },
    { colocacao: 2, pontos: 80 },
  ],
};

test('formulário tem uma linha por grupo, mesmo que o desafio tenha menos', () => {
  assert.deepEqual(paraFormulario(hackathon, 3).pontos, ['100', '80', '']);
  assert.deepEqual(paraFormulario(undefined, 2), { nome: '', descricao: '', diaId: '', pontos: ['', ''] });
});

test('monta o envio no formato do contrato', () => {
  assert.deepEqual(montarDesafio(paraFormulario(hackathon, 2), 2), {
    dados: { nome: 'Hackathon', descricao: '6 horas', diaId: 2, pontosColocacao: hackathon.pontosColocacao },
  });
});

test('recusa nome, dia ou pontos faltando e evento sem grupos', () => {
  const base = paraFormulario(hackathon, 2);
  const erro = (f: object, grupos = 2) => {
    const r = montarDesafio({ ...base, ...f }, grupos);
    return 'erro' in r ? r.erro : '';
  };
  assert.match(erro({ nome: ' ' }), /nome/);
  assert.match(erro({ diaId: '' }), /dia/);
  assert.match(erro({ pontos: ['100', '7,5'] }), /2º lugar/);
  assert.match(erro({ pontos: ['100', ''] }), /2º lugar/);
  assert.match(erro({ pontos: [] }, 0), /grupos/);
  assert.match(erro({}, 3), /uma linha por grupo \(3\)/);
});

test('recusa nome acima de 100 e descrição acima de 255 caracteres', () => {
  const base = paraFormulario(hackathon, 2);
  const erro = (f: object) => {
    const r = montarDesafio({ ...base, ...f }, 2);
    return 'erro' in r ? r.erro : '';
  };
  assert.equal(erro({ nome: 'x'.repeat(100) }), '');
  assert.match(erro({ nome: 'x'.repeat(101) }), /100/);
  assert.match(erro({ descricao: 'x'.repeat(256) }), /255/);
});

test('PATCH leva só os campos alterados e a tabela inteira quando ela muda', () => {
  const dados = { nome: 'Hackathon', descricao: '6 horas', diaId: 2, pontosColocacao: hackathon.pontosColocacao };
  assert.deepEqual(camposAlterados(hackathon, dados), {});
  assert.deepEqual(camposAlterados(hackathon, { ...dados, nome: 'Hackathon final' }), { nome: 'Hackathon final' });
  // A mesma tabela em outra ordem não conta como mudança.
  assert.deepEqual(camposAlterados(hackathon, { ...dados, pontosColocacao: [...hackathon.pontosColocacao].reverse() }), {});
  const novaTabela = [
    { colocacao: 1, pontos: 100 },
    { colocacao: 2, pontos: 70 },
  ];
  assert.deepEqual(camposAlterados(hackathon, { ...dados, diaId: 1, pontosColocacao: novaTabela }), { diaId: 1, pontosColocacao: novaTabela });
});
