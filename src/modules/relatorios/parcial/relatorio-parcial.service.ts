import { Injectable } from '@nestjs/common';
import type {
  LinhaClassificacao,
  ResumoClassificacao,
} from '../../classificacao/calculo-classificacao.js';
import { ClassificacaoService } from '../../classificacao/classificacao.service.js';
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

export type LinhaClassificacaoParcial = LinhaClassificacao;
export type ResumoClassificacaoParcial = ResumoClassificacao;

export interface ClassificacaoParcialCalculada {
  evento: EventoDetalhe;
  dados: LinhaClassificacaoParcial[];
  resumo: ResumoClassificacaoParcial;
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
    private readonly eventosService: EventosService,
    private readonly classificacaoService: ClassificacaoService,
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

  /** Mesma classificação do GET /classificacao (RF15 usa os desafios já lançados). */
  async calcularClassificacaoParcial(
    eventoId: number,
  ): Promise<ClassificacaoParcialCalculada> {
    const evento = await this.eventosService.buscarPorId(eventoId);
    const { dados, resumo } =
      await this.classificacaoService.calcularParaEvento(eventoId);
    return { evento, dados, resumo };
  }
}
