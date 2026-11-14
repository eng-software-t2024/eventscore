import { NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TipoCriterioDesempate } from '../../../common/enums/tipo-criterio-desempate.enum.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { EventosService } from '../../eventos/eventos.service.js';
import { FormatoRelatorio } from '../enums/formato-relatorio.enum.js';
import { PdfTabelaExporter } from '../exporters/pdf-tabela.exporter.js';
import { XlsxPlanilhaExporter } from '../exporters/xlsx-planilha.exporter.js';
import { RelatorioParcialService } from './relatorio-parcial.service.js';

const eventoMock = {
  id: 1,
  nome: 'Arena Comp 2026',
  ano: 2026,
  dataInicio: '2026-11-20',
  dataFim: '2026-11-22',
  quantidadeDias: 3,
  ativo: true,
  temResultado: true,
};

describe('RelatorioParcialService', () => {
  const prisma = {
    grupo: { findMany: vi.fn() },
    desafio: { findMany: vi.fn() },
    bonificacaoGrupo: { findMany: vi.fn() },
    penalidade: { findMany: vi.fn() },
    criterioDesempate: { findMany: vi.fn() },
    desempateManual: { findMany: vi.fn() },
  };
  const eventosService = {
    buscarPorId: vi.fn(),
  };
  const pdfExporter = new PdfTabelaExporter();
  const xlsxExporter = new XlsxPlanilhaExporter();

  let service: RelatorioParcialService;

  beforeEach(() => {
    vi.resetAllMocks();
    eventosService.buscarPorId.mockResolvedValue(eventoMock);
    prisma.grupo.findMany.mockResolvedValue([]);
    prisma.desafio.findMany.mockResolvedValue([]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([]);
    prisma.penalidade.findMany.mockResolvedValue([]);
    prisma.criterioDesempate.findMany.mockResolvedValue([]);
    prisma.desempateManual.findMany.mockResolvedValue([]);

    service = new RelatorioParcialService(
      prisma as unknown as PrismaService,
      eventosService as unknown as EventosService,
      pdfExporter,
      xlsxExporter,
    );
  });

  it('lança NotFoundException (404) quando o evento não existe', async () => {
    eventosService.buscarPorId.mockRejectedValueOnce(
      new NotFoundException('Evento não encontrado'),
    );

    await expect(
      service.gerarRelatorioParcial(999, FormatoRelatorio.PDF),
    ).rejects.toThrow(new NotFoundException('Evento não encontrado'));
    expect(prisma.grupo.findMany).not.toHaveBeenCalled();
  });

  it('calcula pontosDesafios (ignorando ausentes e desafios não lançados), bônus, penalidades e total', async () => {
    prisma.grupo.findMany.mockResolvedValue([
      { id: 1, eventoId: 1, nome: 'Alfa', cor: '#FF5733' },
      { id: 2, eventoId: 1, nome: 'Beta', cor: '#3380FF' },
    ]);
    prisma.desafio.findMany.mockResolvedValue([
      {
        id: 10,
        eventoId: 1,
        nome: 'Hackathon',
        pontosColocacao: [
          { colocacao: 1, pontos: 100 },
          { colocacao: 2, pontos: 70 },
        ],
        resultados: [
          { grupoId: 1, colocacao: 1, ausente: false },
          { grupoId: 2, colocacao: null, ausente: true },
        ],
      },
      {
        id: 11,
        eventoId: 1,
        nome: 'Quiz Técnico (Ainda sem lançamento)',
        pontosColocacao: [{ colocacao: 1, pontos: 80 }],
        resultados: [],
      },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([
      { grupoId: 1, valor: 15 },
      { grupoId: 2, valor: 10 },
    ]);
    prisma.penalidade.findMany.mockResolvedValue([
      { grupoId: 1, pontos: 5 },
      { grupoId: 2, pontos: 20 },
    ]);

    const resultado = await service.calcularClassificacaoParcial(1);

    expect(resultado.resumo).toEqual({
      desafiosLancados: 1,
      desafiosTotais: 2,
      empatesPendentes: [],
    });
    expect(resultado.dados).toEqual([
      {
        posicao: 1,
        grupoId: 1,
        grupo: 'Alfa',
        cor: '#FF5733',
        pontosDesafios: 100,
        bonificacao: 15,
        penalidade: 5,
        total: 110,
        empatado: false,
      },
      {
        posicao: 2,
        grupoId: 2,
        grupo: 'Beta',
        cor: '#3380FF',
        pontosDesafios: 0,
        bonificacao: 10,
        penalidade: 20,
        total: -10,
        empatado: false,
      },
    ]);
  });

  it('aplica os critérios de desempate (MAIOR_PONTUACAO_DESAFIO, MAIOR_SOMA_DESAFIOS, MAIOR_BONIFICACAO, MENOR_PENALIDADE) em ordem', async () => {
    prisma.grupo.findMany.mockResolvedValue([
      { id: 1, eventoId: 1, nome: 'Alfa', cor: '#111111' },
      { id: 2, eventoId: 1, nome: 'Beta', cor: '#222222' },
      { id: 3, eventoId: 1, nome: 'Gama', cor: '#333333' },
      { id: 4, eventoId: 1, nome: 'Delta', cor: '#444444' },
    ]);
    // Todos os 4 grupos terminam com total = 100:
    // - Beta vence no critério 1 (MAIOR_PONTUACAO_DESAFIO no desafio 10: 80 pts vs 60 pts dos demais)
    // - Gama vence no critério 2 (MAIOR_SOMA_DESAFIOS: 95 pts vs 90 pts de Alfa e Delta)
    // - Delta vence Alfa no critério 4 (MENOR_PENALIDADE: 0 vs 10 de Alfa)
    prisma.desafio.findMany.mockResolvedValue([
      {
        id: 10,
        eventoId: 1,
        nome: 'Desafio 1',
        pontosColocacao: [
          { colocacao: 1, pontos: 80 },
          { colocacao: 2, pontos: 60 },
        ],
        resultados: [
          { grupoId: 2, colocacao: 1, ausente: false },
          { grupoId: 1, colocacao: 2, ausente: false },
          { grupoId: 3, colocacao: 2, ausente: false },
          { grupoId: 4, colocacao: 2, ausente: false },
        ],
      },
      {
        id: 11,
        eventoId: 1,
        nome: 'Desafio 2',
        pontosColocacao: [
          { colocacao: 1, pontos: 35 },
          { colocacao: 2, pontos: 30 },
          { colocacao: 3, pontos: 20 },
        ],
        resultados: [
          { grupoId: 3, colocacao: 1, ausente: false },
          { grupoId: 1, colocacao: 2, ausente: false },
          { grupoId: 4, colocacao: 2, ausente: false },
          { grupoId: 2, colocacao: 3, ausente: false },
        ],
      },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([
      { grupoId: 2, valor: 0 }, // 80 + 20 = 100
      { grupoId: 3, valor: 5 }, // 60 + 35 + 5 = 100
      { grupoId: 4, valor: 10 }, // 60 + 30 + 10 - 0 = 100
      { grupoId: 1, valor: 20 }, // 60 + 30 + 20 - 10 = 100
    ]);
    prisma.penalidade.findMany.mockResolvedValue([{ grupoId: 1, pontos: 10 }]);
    prisma.criterioDesempate.findMany.mockResolvedValue([
      {
        ordem: 1,
        tipo: TipoCriterioDesempate.MAIOR_PONTUACAO_DESAFIO,
        desafioId: 10,
      },
      {
        ordem: 2,
        tipo: TipoCriterioDesempate.MAIOR_SOMA_DESAFIOS,
        desafioId: null,
      },
      {
        ordem: 3,
        tipo: TipoCriterioDesempate.MENOR_PENALIDADE,
        desafioId: null,
      },
      {
        ordem: 4,
        tipo: TipoCriterioDesempate.MAIOR_BONIFICACAO,
        desafioId: null,
      },
    ]);

    const resultado = await service.calcularClassificacaoParcial(1);

    expect(
      resultado.dados.map((d) => ({
        pos: d.posicao,
        grupo: d.grupo,
        empatado: d.empatado,
      })),
    ).toEqual([
      { pos: 1, grupo: 'Beta', empatado: false },
      { pos: 2, grupo: 'Gama', empatado: false },
      { pos: 3, grupo: 'Delta', empatado: false },
      { pos: 4, grupo: 'Alfa', empatado: false },
    ]);
    expect(resultado.resumo.empatesPendentes).toEqual([]);
  });

  it('resolve empate via DesempateManual vigente quando o snapshot de pontos permanece igual', async () => {
    prisma.grupo.findMany.mockResolvedValue([
      { id: 2, eventoId: 1, nome: 'Beta', cor: '#222222' },
      { id: 3, eventoId: 1, nome: 'Gama', cor: '#333333' },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([
      { grupoId: 2, valor: 50 },
      { grupoId: 3, valor: 50 },
    ]);
    prisma.desempateManual.findMany.mockResolvedValue([
      {
        grupoId: 3,
        apuracaoId: 99,
        posicao: 1,
        apuracao: {
          classificacoes: [
            {
              grupoId: 3,
              pontosDesafios: 0,
              pontosBonificacoes: 50,
              pontosPenalidades: 0,
              pontosTotal: 50,
            },
            {
              grupoId: 2,
              pontosDesafios: 0,
              pontosBonificacoes: 50,
              pontosPenalidades: 0,
              pontosTotal: 50,
            },
          ],
        },
      },
      {
        grupoId: 2,
        apuracaoId: 99,
        posicao: 2,
        apuracao: {
          classificacoes: [
            {
              grupoId: 3,
              pontosDesafios: 0,
              pontosBonificacoes: 50,
              pontosPenalidades: 0,
              pontosTotal: 50,
            },
            {
              grupoId: 2,
              pontosDesafios: 0,
              pontosBonificacoes: 50,
              pontosPenalidades: 0,
              pontosTotal: 50,
            },
          ],
        },
      },
    ]);

    const resultado = await service.calcularClassificacaoParcial(1);

    expect(resultado.dados).toEqual([
      expect.objectContaining({ posicao: 1, grupo: 'Gama', empatado: false }),
      expect.objectContaining({ posicao: 2, grupo: 'Beta', empatado: false }),
    ]);
    expect(resultado.resumo.empatesPendentes).toEqual([]);
  });

  it('mantém grupos empatados na mesma posição com "(Empate)" sem lançar 409 e exporta PDF e XLSX válidos', async () => {
    prisma.grupo.findMany.mockResolvedValue([
      { id: 1, eventoId: 1, nome: 'Alfa', cor: '#FF5733' },
      { id: 2, eventoId: 1, nome: 'Beta', cor: '#3380FF' },
      { id: 3, eventoId: 1, nome: 'Gama', cor: '#15803D' },
      { id: 4, eventoId: 1, nome: 'Delta', cor: '#B7791F' },
    ]);
    prisma.bonificacaoGrupo.findMany.mockResolvedValue([
      { grupoId: 1, valor: 278 },
      { grupoId: 2, valor: 218 },
      { grupoId: 3, valor: 218 },
      { grupoId: 4, valor: 200 },
    ]);

    const relatorioPdf = await service.gerarRelatorioParcial(
      1,
      FormatoRelatorio.PDF,
    );
    expect(relatorioPdf.contentType).toBe('application/pdf');
    expect(relatorioPdf.nomeArquivo).toBe(
      'relatorio-parcial-arena-comp-2026.pdf',
    );
    expect(relatorioPdf.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const relatorioXlsx = await service.gerarRelatorioParcial(
      1,
      FormatoRelatorio.XLSX,
    );
    expect(relatorioXlsx.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(relatorioXlsx.nomeArquivo).toBe(
      'relatorio-parcial-arena-comp-2026.xlsx',
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(relatorioXlsx.buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('Relatório Parcial');
    expect(sheet).toBeDefined();

    // Linha 6: cabeçalhos exatos do handoff
    expect(
      [1, 2, 3, 4, 5, 6].map((c) => sheet?.getRow(6).getCell(c).value),
    ).toEqual([
      'Posição',
      'Equipe',
      'Pontos dos desafios',
      'Bônus',
      'Penalidade',
      'Total',
    ]);

    // Linhas 7 a 10: Alfa (1º), Beta (2º (Empate)), Gama (2º (Empate)), Delta (4º)
    expect(sheet?.getRow(7).getCell(1).value).toBe('1º');
    expect(sheet?.getRow(7).getCell(2).value).toBe('Alfa');
    expect(sheet?.getRow(8).getCell(1).value).toBe('2º (Empate)');
    expect(sheet?.getRow(8).getCell(2).value).toBe('Beta');
    expect(sheet?.getRow(9).getCell(1).value).toBe('2º (Empate)');
    expect(sheet?.getRow(9).getCell(2).value).toBe('Gama');
    expect(sheet?.getRow(10).getCell(1).value).toBe('4º');
    expect(sheet?.getRow(10).getCell(2).value).toBe('Delta');
  });
});
