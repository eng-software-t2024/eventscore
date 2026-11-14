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
  });
});
