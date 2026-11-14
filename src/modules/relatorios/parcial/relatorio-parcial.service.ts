import { Injectable } from '@nestjs/common';
import { TipoCriterioDesempate } from '../../../common/enums/tipo-criterio-desempate.enum.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  type EventoDetalhe,
  EventosService,
} from '../../eventos/eventos.service.js';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';
import { PdfTabelaExporter } from '../exporters/pdf-tabela.exporter.js';
import {
  type ArquivoRelatorioGerado,
  type ColunaRelatorio,
  montarContentDisposition,
  montarNomeArquivoRelatorio,
  obterContentTypeRelatorio,
  type TabelaRelatorioConfig,
} from '../exporters/relatorio-export.types.js';
import { XlsxPlanilhaExporter } from '../exporters/xlsx-planilha.exporter.js';

export interface LinhaClassificacaoParcial {
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

export interface ResumoClassificacaoParcial {
  desafiosLancados: number;
  desafiosTotais: number;
  empatesPendentes: number[][];
}

export interface ClassificacaoParcialCalculada {
  evento: EventoDetalhe;
  dados: LinhaClassificacaoParcial[];
  resumo: ResumoClassificacaoParcial;
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

interface CriterioOrdenacao {
  ordem: number;
  tipo: string;
  desafioId: number | null;
}

interface DesempateVigenteInfo {
  grupoId: number;
  apuracaoId: number;
  posicao: number;
  snapshot?: {
    pontosDesafios: number;
    pontosBonificacoes: number;
    pontosPenalidades: number;
    pontosTotal: number;
  };
}

const COLUNAS_RELATORIO_PARCIAL: ColunaRelatorio[] = [
  {
    chave: 'posicao',
    titulo: 'Posição',
    alinhamento: 'center',
    larguraPeso: 1.3,
    larguraMinimaXlsx: 16,
  },
  {
    chave: 'equipe',
    titulo: 'Equipe',
    alinhamento: 'left',
    larguraPeso: 2.4,
    larguraMinimaXlsx: 24,
  },
  {
    chave: 'pontosDesafios',
    titulo: 'Pontos dos desafios',
    alinhamento: 'right',
    larguraPeso: 1.5,
    larguraMinimaXlsx: 20,
  },
  {
    chave: 'bonus',
    titulo: 'Bônus',
    alinhamento: 'right',
    larguraPeso: 1.1,
    larguraMinimaXlsx: 12,
  },
  {
    chave: 'penalidade',
    titulo: 'Penalidade',
    alinhamento: 'right',
    larguraPeso: 1.2,
    larguraMinimaXlsx: 14,
  },
  {
    chave: 'total',
    titulo: 'Total',
    alinhamento: 'right',
    larguraPeso: 1.2,
    larguraMinimaXlsx: 14,
  },
];

@Injectable()
export class RelatorioParcialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventosService: EventosService,
    private readonly pdfExporter: PdfTabelaExporter,
    private readonly xlsxExporter: XlsxPlanilhaExporter,
  ) {}

  async gerarRelatorioParcial(
    eventoId: number,
    formato: FormatoRelatorio,
  ): Promise<ArquivoRelatorioGerado> {
    const { evento, dados, resumo } =
      await this.calcularClassificacaoParcial(eventoId);

    const configTabela: TabelaRelatorioConfig = {
      nomePlanilha: 'Relatório Parcial',
      nomeEvento: evento.nome,
      tituloRelatorio: 'Relatório parcial por grupo',
      subtitulo: `${resumo.desafiosLancados} de ${resumo.desafiosTotais} desafios lançados`,
      geradoEm: new Date(),
      secoes: [
        {
          colunas: COLUNAS_RELATORIO_PARCIAL,
          mensagemVazia: 'Nenhum grupo cadastrado neste evento.',
          linhas: dados.map((linha) => ({
            posicao: linha.empatado
              ? `${linha.posicao}º (Empate)`
              : `${linha.posicao}º`,
            equipe: linha.grupo,
            pontosDesafios: linha.pontosDesafios,
            bonus: linha.bonificacao,
            penalidade: linha.penalidade,
            total: linha.total,
          })),
        },
      ],
    };

    const buffer =
      formato === FormatoRelatorio.PDF
        ? await this.pdfExporter.gerarBuffer(configTabela)
        : await this.xlsxExporter.gerarBuffer(configTabela);

    const nomeArquivo = montarNomeArquivoRelatorio(
      'parcial',
      evento.nome,
      formato,
    );

    return {
      buffer,
      contentType: obterContentTypeRelatorio(formato),
      nomeArquivo,
      contentDisposition: montarContentDisposition(nomeArquivo),
    };
  }

  async calcularClassificacaoParcial(
    eventoId: number,
  ): Promise<ClassificacaoParcialCalculada> {
    const evento = await this.eventosService.buscarPorId(eventoId);

    const [
      grupos,
      desafios,
      bonificacoes,
      penalidades,
      criterios,
      desempatesVigentes,
    ] = await Promise.all([
      this.prisma.grupo.findMany({
        where: { eventoId },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.desafio.findMany({
        where: { eventoId },
        include: {
          pontosColocacao: true,
          resultados: true,
        },
      }),
      this.prisma.bonificacaoGrupo.findMany({
        where: { grupo: { eventoId } },
      }),
      this.prisma.penalidade.findMany({
        where: { grupo: { eventoId } },
      }),
      this.prisma.criterioDesempate.findMany({
        where: { eventoId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.desempateManual.findMany({
        where: { eventoId, vigente: true },
        include: {
          apuracao: {
            include: {
              classificacoes: true,
            },
          },
        },
      }),
    ]);

    const desafiosTotais = desafios.length;
    const desafiosComResultado = desafios.filter(
      (desafio) => desafio.resultados.length > 0,
    );
    const desafiosLancados = desafiosComResultado.length;
    const desafiosLancadosIds = new Set(
      desafiosComResultado.map((desafio) => desafio.id),
    );

    const acumuladosPorGrupo = new Map<number, AcumuladoGrupo>();
    for (const grupo of grupos) {
      acumuladosPorGrupo.set(grupo.id, {
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
      const mapaPontosColocacao = new Map<number, number>();
      for (const item of desafio.pontosColocacao) {
        mapaPontosColocacao.set(item.colocacao, item.pontos);
      }

      for (const resultado of desafio.resultados) {
        const acumulado = acumuladosPorGrupo.get(resultado.grupoId);
        if (!acumulado) {
          continue;
        }

        const pontos =
          resultado.ausente || resultado.colocacao === null
            ? 0
            : (mapaPontosColocacao.get(resultado.colocacao) ?? 0);

        const anterior = acumulado.pontosPorDesafio.get(desafio.id) ?? 0;
        acumulado.pontosPorDesafio.set(desafio.id, anterior + pontos);
        acumulado.pontosDesafios += pontos;
      }
    }

    for (const bonus of bonificacoes) {
      const acumulado = acumuladosPorGrupo.get(bonus.grupoId);
      if (acumulado) {
        acumulado.bonificacao += bonus.valor;
      }
    }

    for (const penalidade of penalidades) {
      const acumulado = acumuladosPorGrupo.get(penalidade.grupoId);
      if (acumulado) {
        acumulado.penalidade += penalidade.pontos;
      }
    }

    for (const acumulado of acumuladosPorGrupo.values()) {
      acumulado.total =
        acumulado.pontosDesafios + acumulado.bonificacao - acumulado.penalidade;
    }

    const mapaDesempateManual =
      this.mapearDesempatesVigentes(desempatesVigentes);

    const listaGrupos = [...acumuladosPorGrupo.values()];
    listaGrupos.sort((a, b) => {
      const diff = this.compararPorTotalECriterios(
        a,
        b,
        criterios,
        desafiosLancadosIds,
      );
      if (diff !== 0) {
        return diff;
      }
      return a.grupo.localeCompare(b.grupo, 'pt-BR');
    });

    const faixasEmpate: AcumuladoGrupo[][] = [];
    for (const item of listaGrupos) {
      const faixaAtual = faixasEmpate[faixasEmpate.length - 1];
      if (!faixaAtual) {
        faixasEmpate.push([item]);
        continue;
      }

      const referencia = faixaAtual[0];
      const comparacao = this.compararPorTotalECriterios(
        referencia,
        item,
        criterios,
        desafiosLancadosIds,
      );

      if (comparacao === 0) {
        faixaAtual.push(item);
      } else {
        faixasEmpate.push([item]);
      }
    }

    const dados: LinhaClassificacaoParcial[] = [];
    const empatesPendentes: number[][] = [];
    let posicaoBase = 1;

    for (const faixa of faixasEmpate) {
      if (faixa.length === 1) {
        const unico = faixa[0];
        dados.push({
          posicao: posicaoBase,
          grupoId: unico.grupoId,
          grupo: unico.grupo,
          cor: unico.cor,
          pontosDesafios: unico.pontosDesafios,
          bonificacao: unico.bonificacao,
          penalidade: unico.penalidade,
          total: unico.total,
          empatado: false,
        });
        posicaoBase += 1;
        continue;
      }

      const ordenadoManual = this.tentarResolverPorDesempateManual(
        faixa,
        posicaoBase,
        mapaDesempateManual,
      );

      if (ordenadoManual) {
        for (let idx = 0; idx < ordenadoManual.length; idx += 1) {
          const item = ordenadoManual[idx];
          dados.push({
            posicao: posicaoBase + idx,
            grupoId: item.grupoId,
            grupo: item.grupo,
            cor: item.cor,
            pontosDesafios: item.pontosDesafios,
            bonificacao: item.bonificacao,
            penalidade: item.penalidade,
            total: item.total,
            empatado: false,
          });
        }
        posicaoBase += ordenadoManual.length;
        continue;
      }

      faixa.sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR'));
      empatesPendentes.push(faixa.map((item) => item.grupoId));

      for (const item of faixa) {
        dados.push({
          posicao: posicaoBase,
          grupoId: item.grupoId,
          grupo: item.grupo,
          cor: item.cor,
          pontosDesafios: item.pontosDesafios,
          bonificacao: item.bonificacao,
          penalidade: item.penalidade,
          total: item.total,
          empatado: true,
        });
      }

      posicaoBase += faixa.length;
    }

    return {
      evento,
      dados,
      resumo: {
        desafiosLancados,
        desafiosTotais,
        empatesPendentes,
      },
    };
  }

  private compararPorTotalECriterios(
    a: AcumuladoGrupo,
    b: AcumuladoGrupo,
    criterios: CriterioOrdenacao[],
    desafiosLancadosIds: Set<number>,
  ): number {
    if (b.total !== a.total) {
      return b.total - a.total;
    }

    for (const criterio of criterios) {
      switch (criterio.tipo) {
        case TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO: {
          if (
            criterio.desafioId !== null &&
            desafiosLancadosIds.has(criterio.desafioId)
          ) {
            const pontosA = a.pontosPorDesafio.get(criterio.desafioId) ?? 0;
            const pontosB = b.pontosPorDesafio.get(criterio.desafioId) ?? 0;
            if (pontosB !== pontosA) {
              return pontosB - pontosA;
            }
          }
          break;
        }
        case TipoCriterioDesempate.MAIOR_SOMA_DESAFIOS: {
          if (b.pontosDesafios !== a.pontosDesafios) {
            return b.pontosDesafios - a.pontosDesafios;
          }
          break;
        }
        case TipoCriterioDesempate.MAIOR_BONIFICACAO: {
          if (b.bonificacao !== a.bonificacao) {
            return b.bonificacao - a.bonificacao;
          }
          break;
        }
        case TipoCriterioDesempate.MENOR_PENALIDADE: {
          if (a.penalidade !== b.penalidade) {
            return a.penalidade - b.penalidade;
          }
          break;
        }
        default:
          break;
      }
    }

    return 0;
  }

  private mapearDesempatesVigentes(
    registros: Array<{
      grupoId: number;
      apuracaoId: number;
      posicao: number;
      apuracao?: {
        classificacoes: Array<{
          grupoId: number;
          pontosDesafios: number;
          pontosBonificacoes: number;
          pontosPenalidades: number;
          pontosTotal: number;
        }>;
      };
    }>,
  ): Map<number, DesempateVigenteInfo> {
    const mapa = new Map<number, DesempateVigenteInfo>();

    for (const reg of registros) {
      const classificacaoSnapshot = reg.apuracao?.classificacoes.find(
        (c) => c.grupoId === reg.grupoId,
      );

      mapa.set(reg.grupoId, {
        grupoId: reg.grupoId,
        apuracaoId: reg.apuracaoId,
        posicao: reg.posicao,
        snapshot: classificacaoSnapshot
          ? {
              pontosDesafios: classificacaoSnapshot.pontosDesafios,
              pontosBonificacoes: classificacaoSnapshot.pontosBonificacoes,
              pontosPenalidades: classificacaoSnapshot.pontosPenalidades,
              pontosTotal: classificacaoSnapshot.pontosTotal,
            }
          : undefined,
      });
    }

    return mapa;
  }

  private tentarResolverPorDesempateManual(
    faixa: AcumuladoGrupo[],
    posicaoBase: number,
    mapaDesempates: Map<number, DesempateVigenteInfo>,
  ): AcumuladoGrupo[] | null {
    const decisoes = faixa.map((item) => mapaDesempates.get(item.grupoId));
    if (decisoes.some((d) => d === undefined)) {
      return null;
    }

    const decisoesValidas = decisoes as DesempateVigenteInfo[];
    const apuracaoIdBase = decisoesValidas[0].apuracaoId;

    for (let i = 0; i < faixa.length; i += 1) {
      const grupo = faixa[i];
      const decisao = decisoesValidas[i];

      if (decisao.apuracaoId !== apuracaoIdBase) {
        return null;
      }

      if (decisao.snapshot) {
        const compativel =
          decisao.snapshot.pontosTotal === grupo.total &&
          decisao.snapshot.pontosDesafios === grupo.pontosDesafios &&
          decisao.snapshot.pontosBonificacoes === grupo.bonificacao &&
          decisao.snapshot.pontosPenalidades === grupo.penalidade;

        if (!compativel) {
          return null;
        }
      }
    }

    const posicoesEsperadas = new Set<number>();
    for (let idx = 0; idx < faixa.length; idx += 1) {
      posicoesEsperadas.add(posicaoBase + idx);
    }

    for (const decisao of decisoesValidas) {
      if (!posicoesEsperadas.has(decisao.posicao)) {
        return null;
      }
    }

    const posicoesUnicas = new Set(decisoesValidas.map((d) => d.posicao));
    if (posicoesUnicas.size !== faixa.length) {
      return null;
    }

    return [...faixa].sort((a, b) => {
      const posA = mapaDesempates.get(a.grupoId)?.posicao ?? 0;
      const posB = mapaDesempates.get(b.grupoId)?.posicao ?? 0;
      return posA - posB;
    });
  }
}
