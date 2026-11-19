import PDFDocument from 'pdfkit';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';
import { PdfTabelaExporter } from './pdf-tabela.exporter.js';
import {
  formatarDataHoraGeracao,
  montarContentDisposition,
  montarNomeArquivoRelatorio,
  obterContentTypeRelatorio,
  slugificarNomeEvento,
  type TabelaRelatorioConfig,
} from './relatorio-export.types.js';

describe('PdfTabelaExporter e utilitários de exportação', () => {
  const exporter = new PdfTabelaExporter();

  describe('Utilitários de nomes e cabeçalhos HTTP', () => {
    it('normaliza acentos e caracteres especiais em slugificarNomeEvento', () => {
      expect(slugificarNomeEvento('Arena Comp 2026 — Edição São Luís!')).toBe(
        'arena-comp-2026-edicao-sao-luis',
      );
      expect(slugificarNomeEvento('   ---   ')).toBe('evento');
    });

    it('monta o nome do arquivo para relatórios parciais e finais em PDF e XLSX', () => {
      expect(
        montarNomeArquivoRelatorio(
          'parcial',
          'Arena Comp 2026',
          FormatoRelatorio.PDF,
        ),
      ).toBe('relatorio-parcial-arena-comp-2026.pdf');

      expect(
        montarNomeArquivoRelatorio(
          'final',
          'Arena Comp 2026',
          FormatoRelatorio.XLSX,
        ),
      ).toBe('relatorio-final-arena-comp-2026.xlsx');
    });

    it('monta Content-Disposition compatível com RFC 5987 / UTF-8', () => {
      const header = montarContentDisposition(
        'relatorio-parcial-arena-comp-2026.pdf',
      );
      expect(header).toBe(
        'attachment; filename="relatorio-parcial-arena-comp-2026.pdf"; filename*=UTF-8\'\'relatorio-parcial-arena-comp-2026.pdf',
      );
    });

    it('retorna o Content-Type correto por formato e formata data/hora', () => {
      expect(obterContentTypeRelatorio(FormatoRelatorio.PDF)).toBe(
        'application/pdf',
      );
      expect(obterContentTypeRelatorio(FormatoRelatorio.XLSX)).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(
        formatarDataHoraGeracao(new Date('2026-11-20T14:35:00.000Z')),
      ).toBe('20/11/2026 14:35');
    });
  });

  describe('Geração de PDF (PdfTabelaExporter)', () => {
    it('gera um Buffer PDF válido iniciando com %PDF- para tabela de classificação parcial', async () => {
      const config: TabelaRelatorioConfig = {
        nomeEvento: 'Arena Comp 2026',
        tituloRelatorio: 'Relatório parcial por grupo',
        subtitulo: '2 de 4 desafios lançados',
        geradoEm: new Date('2026-11-20T15:00:00.000Z'),
        secoes: [
          {
            colunas: [
              { chave: 'posicao', titulo: 'Posição', alinhamento: 'center' },
              { chave: 'equipe', titulo: 'Equipe', alinhamento: 'left' },
              {
                chave: 'pontosDesafios',
                titulo: 'Pontos dos desafios',
                alinhamento: 'right',
              },
              { chave: 'bonus', titulo: 'Bônus', alinhamento: 'right' },
              {
                chave: 'penalidade',
                titulo: 'Penalidade',
                alinhamento: 'right',
              },
              { chave: 'total', titulo: 'Total', alinhamento: 'right' },
            ],
            linhas: [
              {
                posicao: '1º',
                equipe: 'Alfa',
                pontosDesafios: 260,
                bonus: 18,
                penalidade: 0,
                total: 278,
              },
              {
                posicao: '2º (Empate)',
                equipe: 'Beta',
                pontosDesafios: 231,
                bonus: 7,
                penalidade: 20,
                total: 218,
              },
            ],
          },
        ],
      };

      const buffer = await exporter.gerarBuffer(config);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.byteLength).toBeGreaterThan(500);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buffer.toString('latin1')).toContain(
        '/MediaBox [0 0 595.28 841.89]',
      );
    });

    it('permite A4 paisagem sem alterar o padrão retrato dos outros relatórios', async () => {
      const buffer = await exporter.gerarBuffer({
        nomeEvento: 'Arena Comp 2026',
        tituloRelatorio: 'Relatório final por participante',
        orientacaoPdf: 'landscape',
        secoes: [
          {
            colunas: [{ chave: 'turma', titulo: 'Turma' }],
            linhas: [{ turma: 'TURMA-2026' }],
          },
        ],
      });

      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buffer.toString('latin1')).toContain(
        '/MediaBox [0 0 841.89 595.28]',
      );
    });

    it('suporta múltiplas seções, seção vazia e quebra automática de página para muitas linhas', async () => {
      const muitasLinhas = Array.from({ length: 55 }, (_, idx) => ({
        posicao: `${idx + 1}º`,
        equipe: `Equipe Competidora Número ${idx + 1}`,
        total: 500 - idx * 5,
      }));

      const config: TabelaRelatorioConfig = {
        nomeEvento: 'Arena Comp 2026',
        tituloRelatorio: 'Relatório com múltiplas páginas',
        secoes: [
          {
            titulo: 'Seção Vazia',
            colunas: [{ chave: 'equipe', titulo: 'Equipe' }],
            linhas: [],
            mensagemVazia: 'Sem registros na seção.',
          },
          {
            titulo: 'Seção Longa',
            colunas: [
              { chave: 'posicao', titulo: 'Posição', larguraPeso: 1 },
              { chave: 'equipe', titulo: 'Equipe', larguraPeso: 3 },
              {
                chave: 'total',
                titulo: 'Total',
                alinhamento: 'right',
                larguraPeso: 1,
              },
            ],
            linhas: muitasLinhas,
          },
        ],
      };

      const buffer = await exporter.gerarBuffer(config);
      const conteudoAscii = buffer.toString('latin1');

      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      const paginasEncontradas = conteudoAscii.match(/\/Type \/Page\b/g) ?? [];
      expect(paginasEncontradas.length).toBeGreaterThanOrEqual(2);
    });

    it('mede e envia matrículas de 17 e 20 caracteres sem cortar os valores da célula', async () => {
      const matricula17 = `A${'1'.repeat(16)}`;
      const matricula20 = `M${'2'.repeat(19)}`;
      const nomeLongo = 'Zélia de Ávila '.repeat(10);
      const grupoLongo = `Grupo São José ${'á'.repeat(45)}`;
      const alturaSpy = vi.spyOn(PDFDocument.prototype, 'heightOfString');
      const textoSpy = vi.spyOn(PDFDocument.prototype, 'text');
      let alturasObservadas: Array<{ texto: string; altura: number }> = [];
      let textosEnviados: unknown[] = [];

      try {
        await exporter.gerarBuffer({
          nomeEvento: 'Relatório final com texto longo',
          tituloRelatorio: 'Relatório final por participante',
          orientacaoPdf: 'landscape',
          secoes: [
            {
              colunas: [
                { chave: 'turma', titulo: 'Turma', larguraPeso: 1.4 },
                { chave: 'matricula', titulo: 'Matrícula', larguraPeso: 1.5 },
                { chave: 'nome', titulo: 'Nome', larguraPeso: 2.2 },
                { chave: 'grupo', titulo: 'Grupo', larguraPeso: 1.2 },
                ...Array.from({ length: 5 }, (_, indice) => ({
                  chave: `dia${indice + 1}`,
                  titulo: `Dia ${indice + 1}`,
                  larguraPeso: 1.1,
                })),
                {
                  chave: 'pontoExtra',
                  titulo: 'Ponto extra',
                  larguraPeso: 1.3,
                },
              ],
              linhas: [matricula17, matricula20].map((matricula) => ({
                turma: 'TURMA-2026',
                matricula,
                nome: nomeLongo,
                grupo: grupoLongo,
                dia1: 'Presente',
                dia2: 'Ausente',
                dia3: 'Ausente',
                dia4: 'Ausente',
                dia5: 'Ausente',
                pontoExtra: 0.16,
              })),
            },
          ],
        });
        alturasObservadas = alturaSpy.mock.calls.map(([texto], indice) => ({
          texto: String(texto),
          altura: Number(alturaSpy.mock.results[indice].value),
        }));
        textosEnviados = textoSpy.mock.calls.map(([texto]) => texto);
      } finally {
        alturaSpy.mockRestore();
        textoSpy.mockRestore();
      }

      for (const matricula of [matricula17, matricula20]) {
        const indiceAltura = alturasObservadas.findIndex(
          ({ texto }) => texto === matricula,
        );
        expect(indiceAltura).toBeGreaterThanOrEqual(0);
        expect(alturasObservadas[indiceAltura].altura).toBeGreaterThan(9);
        expect(textosEnviados).toContain(matricula);
      }
      expect(alturasObservadas.some(({ texto }) => texto === nomeLongo)).toBe(
        true,
      );
      expect(textosEnviados).toContain(grupoLongo);
    });
  });
});
