import ExcelJS from 'exceljs';
import type { TabelaRelatorioConfig } from './relatorio-export.types.js';
import { XlsxPlanilhaExporter } from './xlsx-planilha.exporter.js';

describe('XlsxPlanilhaExporter', () => {
  const exporter = new XlsxPlanilhaExporter();

  it('gera um arquivo .xlsx válido contendo cabeçalho do evento, colunas do handoff e valores numéricos', async () => {
    const config: TabelaRelatorioConfig = {
      nomePlanilha: 'Relatório Parcial',
      nomeEvento: 'Arena Comp 2026',
      tituloRelatorio: 'Relatório parcial por grupo',
      subtitulo: '2 de 4 desafios lançados',
      geradoEm: new Date('2026-11-20T18:30:00.000Z'),
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
            { chave: 'penalidade', titulo: 'Penalidade', alinhamento: 'right' },
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
            {
              posicao: '2º (Empate)',
              equipe: 'Gama',
              pontosDesafios: 210,
              bonus: 8,
              penalidade: 0,
              total: 218,
            },
          ],
        },
      ],
    };

    const buffer = await exporter.gerarBuffer(config);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.getWorksheet('Relatório Parcial');
    expect(sheet).toBeDefined();

    expect(sheet?.getRow(1).getCell(1).value).toBe('Arena Comp 2026');
    expect(sheet?.getRow(2).getCell(1).value).toBe(
      'Relatório parcial por grupo',
    );
    expect(sheet?.getRow(3).getCell(1).value).toBe('2 de 4 desafios lançados');
    expect(sheet?.getRow(4).getCell(1).value).toBe(
      'Gerado em: 20/11/2026 18:30',
    );

    const cabecalho = [1, 2, 3, 4, 5, 6].map(
      (col) => sheet?.getRow(6).getCell(col).value,
    );
    expect(cabecalho).toEqual([
      'Posição',
      'Equipe',
      'Pontos dos desafios',
      'Bônus',
      'Penalidade',
      'Total',
    ]);

    const primeiraLinha = [1, 2, 3, 4, 5, 6].map(
      (col) => sheet?.getRow(7).getCell(col).value,
    );
    expect(primeiraLinha).toEqual(['1º', 'Alfa', 260, 18, 0, 278]);

    const segundaLinha = [1, 2, 3, 4, 5, 6].map(
      (col) => sheet?.getRow(8).getCell(col).value,
    );
    expect(segundaLinha).toEqual(['2º (Empate)', 'Beta', 231, 7, 20, 218]);
  });

  it('suporta relatório com múltiplas seções (ex.: turmas na #229) e valores decimais', async () => {
    const config: TabelaRelatorioConfig = {
      nomePlanilha: 'Relatório Final: Turmas / Alunos (2026)',
      nomeEvento: 'Arena Comp 2026',
      tituloRelatorio: 'Relatório final por participante',
      secoes: [
        {
          titulo: 'Turma ES 2026.2',
          colunas: [
            { chave: 'turma', titulo: 'Turma' },
            { chave: 'matricula', titulo: 'Matrícula' },
            { chave: 'nome', titulo: 'Nome' },
            {
              chave: 'pontoExtra',
              titulo: 'Ponto extra',
              alinhamento: 'right',
            },
          ],
          linhas: [
            {
              turma: 'ES 2026.2',
              matricula: '2026-101',
              nome: 'Lucas Vitorino',
              pontoExtra: 0.8,
            },
          ],
        },
        {
          titulo: 'Turma Vazia',
          colunas: [{ chave: 'nome', titulo: 'Nome' }],
          linhas: [],
        },
      ],
    };

    const buffer = await exporter.gerarBuffer(config);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.worksheets[0];
    expect(sheet.name.length).toBeLessThanOrEqual(31);
  });
});

