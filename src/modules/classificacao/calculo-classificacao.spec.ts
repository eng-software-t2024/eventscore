import { TipoCriterioDesempate } from '../../common/enums/tipo-criterio-desempate.enum.js';
import {
  calcularClassificacao,
  type DadosClassificacao,
} from './calculo-classificacao.js';

const grupos = [
  { id: 1, nome: 'Alfa', cor: '#111111' },
  { id: 2, nome: 'Beta', cor: '#222222' },
  { id: 3, nome: 'Gama', cor: '#333333' },
  { id: 4, nome: 'Delta', cor: '#444444' },
];

const tabela = [
  { colocacao: 1, pontos: 100 },
  { colocacao: 2, pontos: 80 },
  { colocacao: 3, pontos: 60 },
  { colocacao: 4, pontos: 50 },
];

function dados(parcial: Partial<DadosClassificacao>): DadosClassificacao {
  return {
    grupos,
    desafios: [],
    bonificacoes: [],
    penalidades: [],
    criterios: [],
    desempatesVigentes: [],
    ...parcial,
  };
}

describe('calcularClassificacao', () => {
  it('soma desafios lançados pela tabela, mais bônus, menos penalidade (RF12)', () => {
    const { dados: linhas, resumo } = calcularClassificacao(
      dados({
        desafios: [
          {
            id: 10,
            pontosColocacao: tabela,
            resultados: [
              { grupoId: 1, colocacao: 2, ausente: false },
              { grupoId: 2, colocacao: 1, ausente: false },
              { grupoId: 3, colocacao: 3, ausente: false },
              { grupoId: 4, colocacao: null, ausente: true },
            ],
          },
          { id: 11, pontosColocacao: tabela, resultados: [] },
        ],
        bonificacoes: [
          { grupoId: 1, valor: 10 },
          { grupoId: 1, valor: 15 },
        ],
        penalidades: [{ grupoId: 2, pontos: 10 }],
      }),
    );

    expect(linhas.map((l) => [l.posicao, l.grupo, l.total])).toEqual([
      [1, 'Alfa', 105],
      [2, 'Beta', 90],
      [3, 'Gama', 60],
      [4, 'Delta', 0],
    ]);
    expect(linhas[0]).toMatchObject({
      pontosDesafios: 80,
      bonificacao: 25,
      penalidade: 0,
      empatado: false,
    });
    expect(resumo).toEqual({
      desafiosLancados: 1,
      desafiosTotais: 2,
      empatesPendentes: [],
    });
  });

  it('aplica os critérios em ordem e para no primeiro que separa (RF13)', () => {
    const { dados: linhas } = calcularClassificacao(
      dados({
        grupos: grupos.slice(0, 3),
        desafios: [
          {
            id: 10,
            pontosColocacao: tabela,
            resultados: [
              { grupoId: 1, colocacao: 1, ausente: false },
              { grupoId: 2, colocacao: 2, ausente: false },
              { grupoId: 3, colocacao: 3, ausente: false },
            ],
          },
        ],
        // Todos ficam com 100 no total.
        bonificacoes: [
          { grupoId: 2, valor: 20 },
          { grupoId: 3, valor: 50 },
        ],
        penalidades: [{ grupoId: 3, pontos: 10 }],
        criterios: [
          { tipo: TipoCriterioDesempate.MENOR_PENALIDADE, desafioId: null },
          {
            tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
            desafioId: 10,
          },
        ],
      }),
    );

    expect(linhas.map((l) => [l.posicao, l.grupo, l.empatado])).toEqual([
      [1, 'Alfa', false],
      [2, 'Beta', false],
      [3, 'Gama', false],
    ]);
  });

  it('ignora critério de desafio ainda não lançado', () => {
    const resultado = calcularClassificacao(
      dados({
        grupos: grupos.slice(0, 2),
        desafios: [{ id: 10, pontosColocacao: tabela, resultados: [] }],
        criterios: [
          {
            tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
            desafioId: 10,
          },
        ],
      }),
    );

    expect(resultado.resumo.empatesPendentes).toEqual([[1, 2]]);
  });

  it('deixa pendente o empate que os critérios não resolvem, na mesma posição', () => {
    const resultado = calcularClassificacao(
      dados({
        bonificacoes: [
          { grupoId: 1, valor: 30 },
          { grupoId: 2, valor: 20 },
          { grupoId: 3, valor: 20 },
          { grupoId: 4, valor: 10 },
        ],
      }),
    );

    expect(
      resultado.dados.map((l) => [l.posicao, l.grupo, l.empatado]),
    ).toEqual([
      [1, 'Alfa', false],
      [2, 'Beta', true],
      [2, 'Gama', true],
      [4, 'Delta', false],
    ]);
    expect(resultado.resumo.empatesPendentes).toEqual([[2, 3]]);
    expect(resultado.empates).toEqual([
      { posicaoInicial: 2, grupoIds: [2, 3], resolvidoManualmente: false },
    ]);
  });

  describe('desempate manual (RF14)', () => {
    const empatados = dados({
      bonificacoes: [
        { grupoId: 1, valor: 30 },
        { grupoId: 2, valor: 20 },
        { grupoId: 3, valor: 20 },
        { grupoId: 4, valor: 10 },
      ],
    });
    const snapshot = {
      pontosDesafios: 0,
      pontosBonificacoes: 20,
      pontosPenalidades: 0,
      pontosTotal: 20,
    };

    it('aplica a decisão vigente enquanto o empate continua igual', () => {
      const resultado = calcularClassificacao({
        ...empatados,
        desempatesVigentes: [
          { grupoId: 3, apuracaoId: 7, posicao: 2, snapshot },
          { grupoId: 2, apuracaoId: 7, posicao: 3, snapshot },
        ],
      });

      expect(
        resultado.dados.map((l) => [l.posicao, l.grupo, l.empatado]),
      ).toEqual([
        [1, 'Alfa', false],
        [2, 'Gama', false],
        [3, 'Beta', false],
        [4, 'Delta', false],
      ]);
      expect(resultado.resumo.empatesPendentes).toEqual([]);
      expect(resultado.empates).toEqual([
        { posicaoInicial: 2, grupoIds: [3, 2], resolvidoManualmente: true },
      ]);
    });

    it('ignora a decisão quando uma correção muda os pontos do grupo', () => {
      const resultado = calcularClassificacao({
        ...empatados,
        desempatesVigentes: [
          { grupoId: 3, apuracaoId: 7, posicao: 2, snapshot },
          {
            grupoId: 2,
            apuracaoId: 7,
            posicao: 3,
            snapshot: { ...snapshot, pontosBonificacoes: 25, pontosTotal: 25 },
          },
        ],
      });

      expect(resultado.resumo.empatesPendentes).toEqual([[2, 3]]);
    });

    it('ignora a decisão quando a posição do empate mudou', () => {
      const resultado = calcularClassificacao({
        ...empatados,
        desempatesVigentes: [
          { grupoId: 3, apuracaoId: 7, posicao: 3, snapshot },
          { grupoId: 2, apuracaoId: 7, posicao: 4, snapshot },
        ],
      });

      expect(resultado.resumo.empatesPendentes).toEqual([[2, 3]]);
    });

    it('ignora decisões de apurações diferentes no mesmo empate', () => {
      const resultado = calcularClassificacao({
        ...empatados,
        desempatesVigentes: [
          { grupoId: 3, apuracaoId: 7, posicao: 2, snapshot },
          { grupoId: 2, apuracaoId: 8, posicao: 3, snapshot },
        ],
      });

      expect(resultado.resumo.empatesPendentes).toEqual([[2, 3]]);
    });
  });
});
