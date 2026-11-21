import { TipoCriterioDesempate } from '../../common/enums/tipo-criterio-desempate.enum.js';

/** Dados que o cálculo da classificação lê do banco (RF12 a RF14). */
export interface DadosClassificacao {
  grupos: Array<{ id: number; nome: string; cor: string }>;
  desafios: Array<{
    id: number;
    pontosColocacao: Array<{ colocacao: number; pontos: number }>;
    resultados: Array<{
      grupoId: number;
      colocacao: number | null;
      ausente: boolean;
    }>;
  }>;
  bonificacoes: Array<{ grupoId: number; valor: number }>;
  penalidades: Array<{ grupoId: number; pontos: number }>;
  /** Critérios do evento, já na ordem de aplicação. */
  criterios: Array<{ tipo: string; desafioId: number | null }>;
  /** Decisões manuais vigentes, com a classificação gravada ao decidir. */
  desempatesVigentes: DesempateVigente[];
}

export interface DesempateVigente {
  grupoId: number;
  apuracaoId: number;
  posicao: number;
  /** Pontos do grupo na apuração gravada junto com a decisão. */
  snapshot?: {
    pontosDesafios: number;
    pontosBonificacoes: number;
    pontosPenalidades: number;
    pontosTotal: number;
  };
}

export interface LinhaClassificacao {
  posicao: number;
  grupoId: number;
  grupo: string;
  cor: string;
  pontosDesafios: number;
  bonificacao: number;
  penalidade: number;
  total: number;
  empatado: boolean;
}

export interface ResumoClassificacao {
  desafiosLancados: number;
  desafiosTotais: number;
  /** Empates que nem os critérios nem uma decisão manual vigente separaram. */
  empatesPendentes: number[][];
}

/**
 * Grupos que os critérios automáticos não separaram, com a primeira posição
 * que ocupam. Inclui os empates já resolvidos por decisão manual, porque um
 * novo `POST /desempates` pode substituir essa decisão.
 */
export interface EmpateClassificacao {
  posicaoInicial: number;
  grupoIds: number[];
  resolvidoManualmente: boolean;
}

export interface ClassificacaoCalculada {
  dados: LinhaClassificacao[];
  resumo: ResumoClassificacao;
  empates: EmpateClassificacao[];
}

interface AcumuladoGrupo {
  grupoId: number;
  grupo: string;
  cor: string;
  pontosDesafios: number;
  bonificacao: number;
  penalidade: number;
  total: number;
  pontosPorDesafio: Map<number, number>;
}

/**
 * Classificação calculada a partir dos lançamentos atuais (ADR 0003, item 5):
 * soma dos desafios lançados, mais bonificação, menos penalidade, ordenada
 * pelo total e pelos critérios configurados, em ordem (RF13). Quando os
 * critérios não separam os grupos, vale a decisão manual vigente (RF14) se
 * ela ainda corresponder ao empate; senão, o empate fica pendente.
 */
export function calcularClassificacao(
  dadosEntrada: DadosClassificacao,
): ClassificacaoCalculada {
  const desafiosComResultado = dadosEntrada.desafios.filter(
    (desafio) => desafio.resultados.length > 0,
  );
  const desafiosLancadosIds = new Set(
    desafiosComResultado.map((desafio) => desafio.id),
  );

  const acumulados = acumularPontos(dadosEntrada, desafiosComResultado);
  const comparar = (a: AcumuladoGrupo, b: AcumuladoGrupo) =>
    compararPorTotalECriterios(
      a,
      b,
      dadosEntrada.criterios,
      desafiosLancadosIds,
    );

  const ordenados = [...acumulados].sort(
    (a, b) => comparar(a, b) || a.grupo.localeCompare(b.grupo, 'pt-BR'),
  );

  const faixas: AcumuladoGrupo[][] = [];
  for (const item of ordenados) {
    const faixaAtual = faixas[faixas.length - 1];
    if (faixaAtual && comparar(faixaAtual[0], item) === 0) {
      faixaAtual.push(item);
    } else {
      faixas.push([item]);
    }
  }

  const desempatesPorGrupo = new Map(
    dadosEntrada.desempatesVigentes.map((d) => [d.grupoId, d]),
  );
  const dados: LinhaClassificacao[] = [];
  const empates: EmpateClassificacao[] = [];
  let posicaoBase = 1;

  for (const faixa of faixas) {
    if (faixa.length === 1) {
      dados.push(paraLinha(faixa[0], posicaoBase, false));
      posicaoBase += 1;
      continue;
    }

    const ordemManual = resolverPorDesempateManual(
      faixa,
      posicaoBase,
      desempatesPorGrupo,
    );

    if (ordemManual) {
      ordemManual.forEach((item, idx) =>
        dados.push(paraLinha(item, posicaoBase + idx, false)),
      );
    } else {
      faixa.sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR'));
      for (const item of faixa) {
        dados.push(paraLinha(item, posicaoBase, true));
      }
    }

    empates.push({
      posicaoInicial: posicaoBase,
      grupoIds: (ordemManual ?? faixa).map((item) => item.grupoId),
      resolvidoManualmente: ordemManual !== null,
    });
    posicaoBase += faixa.length;
  }

  return {
    dados,
    resumo: {
      desafiosLancados: desafiosComResultado.length,
      desafiosTotais: dadosEntrada.desafios.length,
      empatesPendentes: empates
        .filter((empate) => !empate.resolvidoManualmente)
        .map((empate) => empate.grupoIds),
    },
    empates,
  };
}

function acumularPontos(
  dadosEntrada: DadosClassificacao,
  desafiosComResultado: DadosClassificacao['desafios'],
): AcumuladoGrupo[] {
  const porGrupo = new Map<number, AcumuladoGrupo>();
  for (const grupo of dadosEntrada.grupos) {
    porGrupo.set(grupo.id, {
      grupoId: grupo.id,
      grupo: grupo.nome,
      cor: grupo.cor,
      pontosDesafios: 0,
      bonificacao: 0,
      penalidade: 0,
      total: 0,
      pontosPorDesafio: new Map<number, number>(),
    });
  }

  for (const desafio of desafiosComResultado) {
    const pontosPorColocacao = new Map(
      desafio.pontosColocacao.map((item) => [item.colocacao, item.pontos]),
    );

    for (const resultado of desafio.resultados) {
      const acumulado = porGrupo.get(resultado.grupoId);
      if (!acumulado) continue;

      // RF09: grupo ausente recebe 0 e não ocupa colocação.
      const pontos =
        resultado.ausente || resultado.colocacao === null
          ? 0
          : (pontosPorColocacao.get(resultado.colocacao) ?? 0);

      acumulado.pontosPorDesafio.set(
        desafio.id,
        (acumulado.pontosPorDesafio.get(desafio.id) ?? 0) + pontos,
      );
      acumulado.pontosDesafios += pontos;
    }
  }

  for (const bonus of dadosEntrada.bonificacoes) {
    const acumulado = porGrupo.get(bonus.grupoId);
    if (acumulado) acumulado.bonificacao += bonus.valor;
  }

  for (const penalidade of dadosEntrada.penalidades) {
    const acumulado = porGrupo.get(penalidade.grupoId);
    if (acumulado) acumulado.penalidade += penalidade.pontos;
  }

  for (const acumulado of porGrupo.values()) {
    acumulado.total =
      acumulado.pontosDesafios + acumulado.bonificacao - acumulado.penalidade;
  }

  return [...porGrupo.values()];
}

function compararPorTotalECriterios(
  a: AcumuladoGrupo,
  b: AcumuladoGrupo,
  criterios: DadosClassificacao['criterios'],
  desafiosLancadosIds: Set<number>,
): number {
  if (b.total !== a.total) {
    return b.total - a.total;
  }

  for (const criterio of criterios) {
    let diferenca = 0;
    switch (criterio.tipo) {
      case TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO:
        if (
          criterio.desafioId !== null &&
          desafiosLancadosIds.has(criterio.desafioId)
        ) {
          diferenca =
            (b.pontosPorDesafio.get(criterio.desafioId) ?? 0) -
            (a.pontosPorDesafio.get(criterio.desafioId) ?? 0);
        }
        break;
      case TipoCriterioDesempate.MAIOR_SOMA_DESAFIOS:
        diferenca = b.pontosDesafios - a.pontosDesafios;
        break;
      case TipoCriterioDesempate.MAIOR_BONIFICACAO:
        diferenca = b.bonificacao - a.bonificacao;
        break;
      case TipoCriterioDesempate.MENOR_PENALIDADE:
        diferenca = a.penalidade - b.penalidade;
        break;
      default:
        break;
    }
    if (diferenca !== 0) return diferenca;
  }

  return 0;
}

/**
 * A decisão manual só vale enquanto continua correspondendo ao empate
 * (ADR 0003, item 5): todos os grupos têm decisão da mesma apuração, com os
 * mesmos pontos gravados nela e posições que cobrem a faixa do empate.
 * Qualquer correção que mude isso devolve o empate para a lista de pendentes.
 */
function resolverPorDesempateManual(
  faixa: AcumuladoGrupo[],
  posicaoBase: number,
  desempatesPorGrupo: Map<number, DesempateVigente>,
): AcumuladoGrupo[] | null {
  const decisoes: DesempateVigente[] = [];
  for (const item of faixa) {
    const decisao = desempatesPorGrupo.get(item.grupoId);
    if (!decisao) return null;
    decisoes.push(decisao);
  }

  const apuracaoId = decisoes[0].apuracaoId;
  for (let i = 0; i < faixa.length; i += 1) {
    const grupo = faixa[i];
    const decisao = decisoes[i];
    if (decisao.apuracaoId !== apuracaoId) return null;

    const snapshot = decisao.snapshot;
    if (
      snapshot &&
      (snapshot.pontosTotal !== grupo.total ||
        snapshot.pontosDesafios !== grupo.pontosDesafios ||
        snapshot.pontosBonificacoes !== grupo.bonificacao ||
        snapshot.pontosPenalidades !== grupo.penalidade)
    ) {
      return null;
    }
  }

  const posicoes = new Set(decisoes.map((d) => d.posicao));
  const ultimaPosicao = posicaoBase + faixa.length - 1;
  if (
    posicoes.size !== faixa.length ||
    [...posicoes].some((p) => p < posicaoBase || p > ultimaPosicao)
  ) {
    return null;
  }

  return [...faixa].sort(
    (a, b) =>
      (desempatesPorGrupo.get(a.grupoId)?.posicao ?? 0) -
      (desempatesPorGrupo.get(b.grupoId)?.posicao ?? 0),
  );
}

function paraLinha(
  item: AcumuladoGrupo,
  posicao: number,
  empatado: boolean,
): LinhaClassificacao {
  return {
    posicao,
    grupoId: item.grupoId,
    grupo: item.grupo,
    cor: item.cor,
    pontosDesafios: item.pontosDesafios,
    bonificacao: item.bonificacao,
    penalidade: item.penalidade,
    total: item.total,
    empatado,
  };
}
