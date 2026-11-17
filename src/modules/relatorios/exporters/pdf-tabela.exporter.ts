import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  type ColunaRelatorio,
  formatarDataHoraGeracao,
  type SecaoRelatorio,
  type TabelaRelatorioConfig,
} from './relatorio-export.types.js';

const MARGEM_PAGINA = 40;
const ALTURA_CABECALHO_TABELA = 24;
const ALTURA_LINHA_PADRAO = 22;
const PADDING_HORIZONTAL_CELULA = 6;
const PADDING_VERTICAL_CELULA = 6;

@Injectable()
export class PdfTabelaExporter {
  async gerarBuffer(config: TabelaRelatorioConfig): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGEM_PAGINA,
        info: {
          Title: `${config.tituloRelatorio} - ${config.nomeEvento}`,
          Author: 'EventScore',
        },
      });

      const partes: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => {
        partes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      doc.on('end', () => {
        resolve(Buffer.concat(partes));
      });
      doc.on('error', (erro: Error) => {
        reject(erro);
      });

      const larguraUtil = doc.page.width - MARGEM_PAGINA * 2;
      const limiteInferior = doc.page.height - MARGEM_PAGINA;

      let cursorY = this.desenharCabecalhoDocumento(
        doc,
        config,
        MARGEM_PAGINA,
        MARGEM_PAGINA,
        larguraUtil,
      );

      for (const secao of config.secoes) {
        cursorY = this.desenharSecao(
          doc,
          secao,
          MARGEM_PAGINA,
          cursorY,
          larguraUtil,
          limiteInferior,
        );
      }

      doc.end();
    });
  }

  private desenharCabecalhoDocumento(
    doc: PDFKit.PDFDocument,
    config: TabelaRelatorioConfig,
    x: number,
    yInicial: number,
    larguraUtil: number,
  ): number {
    let y = yInicial;

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#0F172A')
      .text(config.nomeEvento, x, y, { width: larguraUtil });
    y = doc.y + 4;

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#1E293B')
      .text(config.tituloRelatorio, x, y, { width: larguraUtil });
    y = doc.y + 4;

    if (config.subtitulo) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#334155')
        .text(config.subtitulo, x, y, { width: larguraUtil });
      y = doc.y + 3;
    }

    const textoDataHora = `Gerado em: ${formatarDataHoraGeracao(config.geradoEm)}`;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748B')
      .text(textoDataHora, x, y, { width: larguraUtil });
    y = doc.y + 14;

    return y;
  }

  private desenharSecao(
    doc: PDFKit.PDFDocument,
    secao: SecaoRelatorio,
    x: number,
    yInicial: number,
    larguraUtil: number,
    limiteInferior: number,
  ): number {
    let y = yInicial;

    if (
      y + ALTURA_CABECALHO_TABELA + ALTURA_LINHA_PADRAO * 2 >
      limiteInferior
    ) {
      doc.addPage();
      y = MARGEM_PAGINA;
    }

    if (secao.titulo) {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#0F172A')
        .text(secao.titulo, x, y, { width: larguraUtil });
      y = doc.y + 6;
    }

    const largurasColunas = this.calcularLargurasColunas(
      secao.colunas,
      larguraUtil,
    );

    y = this.desenharCabecalhoTabela(
      doc,
      secao.colunas,
      largurasColunas,
      x,
      y,
      larguraUtil,
    );

    if (secao.linhas.length === 0) {
      const mensagem = secao.mensagemVazia ?? 'Nenhum registro encontrado.';
      doc
        .rect(x, y, larguraUtil, ALTURA_LINHA_PADRAO)
        .fillAndStroke('#F8FAFC', '#E2E8F0');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#475569')
        .text(
          mensagem,
          x + PADDING_HORIZONTAL_CELULA,
          y + PADDING_VERTICAL_CELULA,
          {
            width: larguraUtil - PADDING_HORIZONTAL_CELULA * 2,
            align: 'center',
          },
        );
      return y + ALTURA_LINHA_PADRAO + 14;
    }

    for (let indice = 0; indice < secao.linhas.length; indice += 1) {
      const linha = secao.linhas[indice];
      const alturaLinha = this.calcularAlturaLinha(
        doc,
        secao.colunas,
        largurasColunas,
        linha,
      );

      if (y + alturaLinha > limiteInferior) {
        doc.addPage();
        y = MARGEM_PAGINA;
        y = this.desenharCabecalhoTabela(
          doc,
          secao.colunas,
          largurasColunas,
          x,
          y,
          larguraUtil,
        );
      }

      const corFundo = indice % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      doc
        .rect(x, y, larguraUtil, alturaLinha)
        .fillAndStroke(corFundo, '#E2E8F0');

      let cursorX = x;
      for (let colIdx = 0; colIdx < secao.colunas.length; colIdx += 1) {
        const coluna = secao.colunas[colIdx];
        const larguraColuna = largurasColunas[colIdx];
        const valorBruto = linha[coluna.chave];
        const textoCelula = valorBruto === undefined ? '' : String(valorBruto);

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#0F172A')
          .text(
            textoCelula,
            cursorX + PADDING_HORIZONTAL_CELULA,
            y + PADDING_VERTICAL_CELULA,
            {
              width: Math.max(
                10,
                larguraColuna - PADDING_HORIZONTAL_CELULA * 2,
              ),
              align: coluna.alinhamento ?? 'left',
            },
          );

        cursorX += larguraColuna;
      }

      y += alturaLinha;
    }

    return y + 14;
  }

  private desenharCabecalhoTabela(
    doc: PDFKit.PDFDocument,
    colunas: ColunaRelatorio[],
    largurasColunas: number[],
    x: number,
    y: number,
    larguraUtil: number,
  ): number {
    doc
      .rect(x, y, larguraUtil, ALTURA_CABECALHO_TABELA)
      .fillAndStroke('#1E293B', '#1E293B');

    let cursorX = x;
    for (let colIdx = 0; colIdx < colunas.length; colIdx += 1) {
      const coluna = colunas[colIdx];
      const larguraColuna = largurasColunas[colIdx];

      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#FFFFFF')
        .text(
          coluna.titulo,
          cursorX + PADDING_HORIZONTAL_CELULA,
          y + PADDING_VERTICAL_CELULA,
          {
            width: Math.max(10, larguraColuna - PADDING_HORIZONTAL_CELULA * 2),
            align: coluna.alinhamento ?? 'left',
          },
        );

      cursorX += larguraColuna;
    }

    return y + ALTURA_CABECALHO_TABELA;
  }

  private calcularLargurasColunas(
    colunas: ColunaRelatorio[],
    larguraUtil: number,
  ): number[] {
    if (colunas.length === 0) {
      return [];
    }

    const pesos = colunas.map((coluna) =>
      coluna.larguraPeso && coluna.larguraPeso > 0 ? coluna.larguraPeso : 1,
    );
    const somaPesos = pesos.reduce((acc, peso) => acc + peso, 0);

    return pesos.map((peso) => (peso / somaPesos) * larguraUtil);
  }

  private calcularAlturaLinha(
    doc: PDFKit.PDFDocument,
    colunas: ColunaRelatorio[],
    largurasColunas: number[],
    linha: Record<string, string | number>,
  ): number {
    doc.font('Helvetica').fontSize(9);

    let maiorAlturaTexto = 0;
    for (let colIdx = 0; colIdx < colunas.length; colIdx += 1) {
      const coluna = colunas[colIdx];
      const larguraTexto = Math.max(
        10,
        largurasColunas[colIdx] - PADDING_HORIZONTAL_CELULA * 2,
      );
      const valorBruto = linha[coluna.chave];
      const textoCelula = valorBruto === undefined ? '' : String(valorBruto);
      const alturaTexto = doc.heightOfString(textoCelula, {
        width: larguraTexto,
        align: coluna.alinhamento ?? 'left',
      });
      if (alturaTexto > maiorAlturaTexto) {
        maiorAlturaTexto = alturaTexto;
      }
    }

    return Math.max(
      ALTURA_LINHA_PADRAO,
      Math.ceil(maiorAlturaTexto + PADDING_VERTICAL_CELULA * 2),
    );
  }
}
