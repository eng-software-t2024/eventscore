import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  type AlinhamentoColunaRelatorio,
  formatarDataHoraGeracao,
  type TabelaRelatorioConfig,
} from './relatorio-export.types.js';

const LARGURA_MINIMA_PADRAO = 12;
const LARGURA_MAXIMA_COLUNA = 48;

@Injectable()
export class XlsxPlanilhaExporter {
  async gerarBuffer(config: TabelaRelatorioConfig): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EventScore';
    workbook.created = config.geradoEm ?? new Date();

    const nomeAba = this.normalizarNomeAba(
      config.nomePlanilha ?? config.tituloRelatorio,
    );
    const worksheet = workbook.addWorksheet(nomeAba);

    const linhaEvento = worksheet.addRow([config.nomeEvento]);
    linhaEvento.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };

    const linhaTitulo = worksheet.addRow([config.tituloRelatorio]);
    linhaTitulo.font = { bold: true, size: 11, color: { argb: 'FF1E293B' } };

    if (config.subtitulo) {
      const linhaSubtitulo = worksheet.addRow([config.subtitulo]);
      linhaSubtitulo.font = { size: 10, color: { argb: 'FF334155' } };
    }

    const linhaGeradoEm = worksheet.addRow([
      `Gerado em: ${formatarDataHoraGeracao(config.geradoEm)}`,
    ]);
    linhaGeradoEm.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };

    worksheet.addRow([]);

    const largurasColunas = new Map<number, number>();

    for (let secaoIdx = 0; secaoIdx < config.secoes.length; secaoIdx += 1) {
      const secao = config.secoes[secaoIdx];

      if (secao.titulo) {
        const linhaSecao = worksheet.addRow([secao.titulo]);
        linhaSecao.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
      }

      const titulosColunas = secao.colunas.map((coluna) => coluna.titulo);
      const linhaCabecalho = worksheet.addRow(titulosColunas);
      linhaCabecalho.font = {
        bold: true,
        size: 10,
        color: { argb: 'FFFFFFFF' },
      };

      secao.colunas.forEach((coluna, colIdx) => {
        const celula = linhaCabecalho.getCell(colIdx + 1);
        celula.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' },
        };
        celula.alignment = {
          vertical: 'middle',
          horizontal: this.mapearAlinhamento(coluna.alinhamento),
        };

        const larguraInicial = Math.max(
          coluna.larguraMinimaXlsx ?? LARGURA_MINIMA_PADRAO,
          coluna.titulo.length + 4,
        );
        const atual = largurasColunas.get(colIdx + 1) ?? 0;
        if (larguraInicial > atual) {
          largurasColunas.set(colIdx + 1, larguraInicial);
        }
      });

      if (secao.linhas.length === 0) {
        const mensagem = secao.mensagemVazia ?? 'Nenhum registro encontrado.';
        const linhaVazia = worksheet.addRow([mensagem]);
        linhaVazia.font = { italic: true, color: { argb: 'FF64748B' } };
      } else {
        for (const registro of secao.linhas) {
          const valores = secao.colunas.map(
            (coluna) => registro[coluna.chave] ?? '',
          );
          const linhaDados = worksheet.addRow(valores);

          secao.colunas.forEach((coluna, colIdx) => {
            const celula = linhaDados.getCell(colIdx + 1);
            celula.alignment = {
              vertical: 'middle',
              horizontal: this.mapearAlinhamento(coluna.alinhamento),
            };

            const valor = valores[colIdx];
            if (typeof valor === 'number' && !Number.isInteger(valor)) {
              celula.numFmt = '0.0#';
            }

            const comprimentoTexto = String(valor).length + 4;
            const atual =
              largurasColunas.get(colIdx + 1) ?? LARGURA_MINIMA_PADRAO;
            if (comprimentoTexto > atual) {
              largurasColunas.set(colIdx + 1, comprimentoTexto);
            }
          });
        }
      }

      if (secaoIdx < config.secoes.length - 1) {
        worksheet.addRow([]);
      }
    }

    for (const [indiceColuna, largura] of largurasColunas.entries()) {
      worksheet.getColumn(indiceColuna).width = Math.min(
        LARGURA_MAXIMA_COLUNA,
        Math.max(LARGURA_MINIMA_PADRAO, largura),
      );
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private mapearAlinhamento(
    alinhamento?: AlinhamentoColunaRelatorio,
  ): 'left' | 'center' | 'right' {
    return alinhamento ?? 'left';
  }

  private normalizarNomeAba(nome: string): string {
    const limpo = nome.replace(/[\\/*?:[\]]/g, ' ').trim();
    if (limpo.length === 0) {
      return 'Relatorio';
    }
    return limpo.slice(0, 31);
  }
}
